;; SupplyTracker.clar
;; Core smart contract for real-time tracking of supplies in emergency supply chains on Stacks blockchain

;; Constants for error codes
(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INVALID-ITEM u101)
(define-constant ERR-ALREADY-EXISTS u102)
(define-constant ERR-INVALID-QUANTITY u103)
(define-constant ERR-INVALID-STATUS u104)
(define-constant ERR-INVALID-LOCATION u105)
(define-constant ERR-PAUSED u106)
(define-constant ERR-NOT-OWNER u107)
(define-constant ERR-INVALID-BATCH u108)
(define-constant ERR-MAX-HISTORY-EXCEEDED u109)
(define-constant ERR-INVALID-EMERGENCY u110)

;; Constants for limits
(define-constant MAX-HISTORY-LENGTH u50) ;; Max history entries per item to prevent storage bloat
(define-constant MAX_DESCRIPTION_LEN u512) ;; Max length for descriptions
(define-constant MAX_METADATA_LEN u1024) ;; Max length for metadata

;; Data variables
(define-data-var contract-paused bool false)
(define-data-var admin principal tx-sender)
(define-data-var item-counter uint u0)
(define-data-var emergency-active bool false) ;; Global flag for emergency mode

;; Main supply items map
(define-map supplies
  { item-id: uint }
  {
    owner: principal,                  ;; Current owner (e.g., supplier or logistics provider)
    description: (string-ascii 256),   ;; Item details (e.g., "Medical kits")
    quantity: uint,                    ;; Current quantity
    initial-quantity: uint,            ;; Original quantity for auditing
    location: (string-ascii 128),      ;; Current location (e.g., GPS coords or warehouse code)
    status: (string-ascii 32),         ;; Status: "stored", "in-transit", "delivered", "damaged"
    emergency-id: uint,                ;; Link to emergency event
    created-at: uint,                  ;; Block height of creation
    last-updated: uint,                ;; Block height of last update
    metadata: (buff 1024)              ;; Additional serialized data (e.g., IPFS hash for docs)
  }
)

;; History log for each item (list of updates)
(define-map supply-history
  { item-id: uint, history-index: uint }
  {
    timestamp: uint,
    updater: principal,
    changes: (string-ascii 256),       ;; Description of change (e.g., "Quantity reduced by 10")
    location: (string-ascii 128),
    status: (string-ascii 32)
  }
)

;; History length tracker
(define-map supply-history-length { item-id: uint } { length: uint })

;; Batch associations (for splitting/merging)
(define-map batch-parents { child-id: uint } { parent-id: uint })
(define-map batch-children { parent-id: uint, index: uint } { child-id: uint })
(define-map batch-child-count { parent-id: uint } { count: uint })

;; Read-only: Get supply details
(define-read-only (get-supply-details (item-id uint))
  (map-get? supplies { item-id: item-id })
)

;; Read-only: Get history entry
(define-read-only (get-history-entry (item-id uint) (index uint))
  (map-get? supply-history { item-id: item-id, history-index: index })
)

;; Read-only: Get history length
(define-read-only (get-history-length (item-id uint))
  (default-to u0 (get length (map-get? supply-history-length { item-id: item-id })))
)

;; Read-only: Get batch parent
(define-read-only (get-batch-parent (child-id uint))
  (map-get? batch-parents { child-id: child-id })
)

;; Read-only: Get batch child
(define-read-only (get-batch-child (parent-id uint) (index uint))
  (map-get? batch-children { parent-id: parent-id, index: index })
)

;; Read-only: Get batch child count
(define-read-only (get-batch-child-count (parent-id uint))
  (default-to u0 (get count (map-get? batch-child-count { parent-id: parent-id })))
)

;; Read-only: Check if paused
(define-read-only (is-paused)
  (var-get contract-paused)
)

;; Read-only: Get admin
(define-read-only (get-admin)
  (var-get admin)
)

;; Private: Validate participant (placeholder for NetworkRegistry integration)
(define-private (is-valid-participant (caller principal))
  true ;; In production: (is-some (contract-call? .NetworkRegistry get-participant caller))
)

;; Private: Validate oracle (placeholder for OracleFeeder)
(define-private (is-oracle (caller principal))
  true ;; In production: (is-some (contract-call? .OracleFeeder is-authorized-oracle caller))
)

;; Private: Validate owner
(define-private (is-owner (caller principal) (item-id uint))
  (match (map-get? supplies { item-id: item-id })
    item (is-eq (get owner item) caller)
    false
  )
)

;; Private: Append history
(define-private (append-history (item-id uint) (changes (string-ascii 256)) (location (string-ascii 128)) (status (string-ascii 32)))
  (let
    (
      (current-length (get-history-length item-id))
      (new-index current-length)
    )
    (asserts! (< current-length MAX-HISTORY-LENGTH) (err ERR-MAX-HISTORY-EXCEEDED))
    (map-set supply-history
      { item-id: item-id, history-index: new-index }
      {
        timestamp: block-height,
        updater: tx-sender,
        changes: changes,
        location: location,
        status: status
      }
    )
    (map-set supply-history-length { item-id: item-id } { length: (+ current-length u1) })
    (print { event: "history-append", item-id: item-id, index: new-index }) ;; Emit event
    (ok true)
  )
)

;; Public: Add new supply item
(define-public (add-supply-item
  (description (string-ascii 256))
  (quantity uint)
  (location (string-ascii 128))
  (status (string-ascii 32))
  (emergency-id uint)
  (metadata (buff 1024)))
  (let
    (
      (item-id (+ (var-get item-counter) u1))
      (caller tx-sender)
    )
    (asserts! (not (var-get contract-paused)) (err ERR-PAUSED))
    (asserts! (is-valid-participant caller) (err ERR-NOT-AUTHORIZED))
    (asserts! (> quantity u0) (err ERR-INVALID-QUANTITY))
    (asserts! (<= (len metadata) MAX_METADATA_LEN) (err ERR-INVALID-ITEM))
    (asserts! (is-none (map-get? supplies { item-id: item-id })) (err ERR-ALREADY-EXISTS))
    (asserts! (validate-description description) (err ERR-INVALID-ITEM))
    (asserts! (validate-location location) (err ERR-INVALID-LOCATION))
    (asserts! (validate-status status) (err ERR-INVALID-STATUS))
    (map-insert supplies
      { item-id: item-id }
      {
        owner: caller,
        description: description,
        quantity: quantity,
        initial-quantity: quantity,
        location: location,
        status: status,
        emergency-id: emergency-id,
        created-at: block-height,
        last-updated: block-height,
        metadata: metadata
      }
    )
    (var-set item-counter item-id)
    (try! (append-history item-id "Item created" location status))
    (print { event: "item-added", item-id: item-id, owner: caller }) ;; Emit event
    (ok item-id)
  )
)

;; Public: Update supply item (location, status, quantity)
(define-public (update-supply-item
  (item-id uint)
  (new-location (string-ascii 128))
  (new-status (string-ascii 32))
  (new-quantity uint))
  (let
    (
      (item-opt (map-get? supplies { item-id: item-id }))
      (caller tx-sender)
    )
    (asserts! (not (var-get contract-paused)) (err ERR-PAUSED))
    (asserts! (is-some item-opt) (err ERR-INVALID-ITEM))
    (let ((item (unwrap-panic item-opt)))
      (asserts! (or (is-oracle caller) (is-owner caller item-id)) (err ERR-NOT-AUTHORIZED))
      (asserts! (<= new-quantity (get initial-quantity item)) (err ERR-INVALID-QUANTITY))
      (map-set supplies
        { item-id: item-id }
        (merge item {
          location: new-location,
          status: new-status,
          quantity: new-quantity,
          last-updated: block-height
        })
      )
      (try! (append-history item-id (concat "Updated: quantity to " (int-to-ascii new-quantity)) new-location new-status))
      (print { event: "item-updated", item-id: item-id, updater: caller })
      (ok true)
    )
  )
)

;; Public: Transfer ownership of item
(define-public (transfer-ownership (item-id uint) (new-owner principal))
  (let
    (
      (item-opt (map-get? supplies { item-id: item-id }))
      (caller tx-sender)
    )
    (asserts! (not (var-get contract-paused)) (err ERR-PAUSED))
    (asserts! (is-some item-opt) (err ERR-INVALID-ITEM))
    (let ((item (unwrap-panic item-opt)))
      (asserts! (is-owner caller item-id) (err ERR-NOT-OWNER))
      (asserts! (is-valid-participant new-owner) (err ERR-NOT-AUTHORIZED))
      (map-set supplies
        { item-id: item-id }
        (merge item { owner: new-owner, last-updated: block-height })
      )
      (try! (append-history item-id (concat "Ownership transferred to " (principal-to-ascii new-owner)) (get location item) (get status item)))
      (print { event: "ownership-transferred", item-id: item-id, new-owner: new-owner })
      (ok true)
    )
  )
)

;; Public: Split batch into child items
(define-public (split-batch (parent-id uint) (child-quantities (list 10 uint)))
  (let
    (
      (parent-opt (map-get? supplies { item-id: parent-id }))
      (caller tx-sender)
      (total-child-quantity (fold + child-quantities u0))
    )
    (asserts! (not (var-get contract-paused)) (err ERR-PAUSED))
    (asserts! (is-some parent-opt) (err ERR-INVALID-ITEM))
    (let ((parent (unwrap-panic parent-opt)))
      (asserts! (is-owner caller parent-id) (err ERR-NOT-OWNER))
      (asserts! (is-eq total-child-quantity (get quantity parent)) (err ERR-INVALID-QUANTITY))
      (asserts! (is-eq (get-batch-child-count parent-id) u0) (err ERR-ALREADY-EXISTS)) ;; Prevent re-splitting
      (fold create-child-item child-quantities { index: u0, parent: parent, parent-id: parent-id })
      (map-set batch-child-count { parent-id: parent-id } { count: (len child-quantities) })
      (map-set supplies { item-id: parent-id } (merge parent { status: "split", quantity: u0, last-updated: block-height }))
      (try! (append-history parent-id "Batch split into children" (get location parent) "split"))
      (print { event: "batch-split", parent-id: parent-id, children-count: (len child-quantities) })
      (ok true)
    )
  )
)

;; Private: Helper to create child item during split
(define-private (create-child-item (quantity uint) (ctx { index: uint, parent: { owner: principal, description: (string-ascii 256), quantity: uint, initial-quantity: uint, location: (string-ascii 128), status: (string-ascii 32), emergency-id: uint, created-at: uint, last-updated: uint, metadata: (buff 1024) }, parent-id: uint }))
  (let
    (
      (index (get index ctx))
      (parent (get parent ctx))
      (parent-id (get parent-id ctx))
      (child-id (+ (var-get item-counter) u1))
    )
    (map-insert supplies
      { item-id: child-id }
      {
        owner: (get owner parent),
        description: (concat (get description parent) (concat " (Child " (concat (int-to-ascii index) ")"))),
        quantity: quantity,
        initial-quantity: quantity,
        location: (get location parent),
        status: (get status parent),
        emergency-id: (get emergency-id parent),
        created-at: block-height,
        last-updated: block-height,
        metadata: (get metadata parent)
      }
    )
    (var-set item-counter child-id)
    (map-set batch-parents { child-id: child-id } { parent-id: parent-id })
    (map-set batch-children { parent-id: parent-id, index: index } { child-id: child-id })
    (try! (append-history child-id "Created as child of parent" (get location parent) (get status parent)))
    { index: (+ index u1), parent: parent, parent-id: parent-id }
  )
)

;; Public: Merge child items back to parent
(define-public (merge-batch (parent-id uint) (child-ids (list 10 uint)))
  (let
    (
      (parent-opt (map-get? supplies { item-id: parent-id }))
      (caller tx-sender)
    )
    (asserts! (not (var-get contract-paused)) (err ERR-PAUSED))
    (asserts! (is-some parent-opt) (err ERR-INVALID-ITEM))
    (let ((parent (unwrap-panic parent-opt)))
      (asserts! (is-owner caller parent-id) (err ERR-NOT-OWNER))
      (asserts! (is-eq (len child-ids) (get-batch-child-count parent-id)) (err ERR-INVALID-BATCH))
      (let ((total-quantity (fold sum-child-quantity child-ids u0)))
        (fold delete-child-item child-ids parent-id)
        (map-delete batch-child-count { parent-id: parent-id })
        (map-set supplies { item-id: parent-id } (merge parent { quantity: total-quantity, status: "merged", last-updated: block-height }))
        (try! (append-history parent-id "Children merged back" (get location parent) "merged"))
        (print { event: "batch-merged", parent-id: parent-id, total-quantity: total-quantity })
        (ok true)
      )
    )
  )
)

;; Private: Sum quantity of child
(define-private (sum-child-quantity (child-id uint) (acc uint))
  (let ((child-opt (map-get? supplies { item-id: child-id })))
    (asserts! (is-some child-opt) (err ERR-INVALID-ITEM))
    (+ acc (get quantity (unwrap-panic child-opt)))
  )
)

;; Private: Delete child item during merge
(define-private (delete-child-item (child-id uint) (parent-id uint))
  (asserts! (is-eq (get parent-id (map-get? batch-parents { child-id: child-id })) (some parent-id)) (err ERR-INVALID-BATCH))
  (map-delete supplies { item-id: child-id })
  (map-delete batch-parents { child-id: child-id })
  ;; Clean history (optional, but for completeness)
  (let ((hist-len (get-history-length child-id)))
    (fold delete-history-entry (list-from-u0 hist-len) { item-id: child-id })
  )
  (map-delete supply-history-length { item-id: child-id })
  parent-id ;; Return for fold
)

;; Private: Helper to create list from 0 to n-1
(define-private (list-from-u0 (n uint))
  (unwrap-panic 
    (if (< n u10)
      (ok (list 
        u0 u1 u2 u3 u4 u5 u6 u7 u8 u9)) ;; Fixed length list instead of ... syntax
      (err u1) ;; Error if n > 10
    )
  )
)

;; Private: Delete history entry
(define-private (delete-history-entry (index uint) (ctx { item-id: uint }))
  (map-delete supply-history { item-id: (get item-id ctx), history-index: index })
  ctx
)

;; Public: Verify delivery (oracle only)
(define-public (verify-delivery (item-id uint) (proof (buff 512)))
  (let
    (
      (item-opt (map-get? supplies { item-id: item-id }))
      (caller tx-sender)
    )
    (asserts! (not (var-get contract-paused)) (err ERR-PAUSED))
    (asserts! (is-some item-opt) (err ERR-INVALID-ITEM))
    (asserts! (is-oracle caller) (err ERR-NOT-AUTHORIZED))
    (let ((item (unwrap-panic item-opt)))
      (map-set supplies { item-id: item-id } (merge item { status: "delivered", last-updated: block-height }))
      (try! (append-history item-id (concat "Delivery verified with proof" (buff-to-string proof)) (get location item) "delivered"))
      (print { event: "delivery-verified", item-id: item-id, proof: proof })
      (ok true)
    )
  )
)

;; Public: Pause contract (admin only)
(define-public (pause-contract)
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) (err ERR-NOT-AUTHORIZED))
    (var-set contract-paused true)
    (print { event: "contract-paused" })
    (ok true)
  )
)

;; Public: Unpause contract (admin only)
(define-public (unpause-contract)
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) (err ERR-NOT-AUTHORIZED))
    (var-set contract-paused false)
    (print { event: "contract-unpaused" })
    (ok true)
  )
)

;; Public: Set new admin
(define-public (set-admin (new-admin principal))
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) (err ERR-NOT-AUTHORIZED))
    (var-set admin new-admin)
    (print { event: "admin-changed", new-admin: new-admin })
    (ok true)
  )
)

;; Public: Activate emergency mode
(define-public (activate-emergency)
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) (err ERR-NOT-AUTHORIZED))
    (var-set emergency-active true)
    (print { event: "emergency-activated" })
    (ok true)
  )
)

;; Public: Deactivate emergency mode
(define-public (deactivate-emergency)
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) (err ERR-NOT-AUTHORIZED))
    (var-set emergency-active false)
    (print { event: "emergency-deactivated" })
    (ok true)
  )
)

;; Read-only: Is emergency active
(define-read-only (is-emergency-active)
  (var-get emergency-active)
)