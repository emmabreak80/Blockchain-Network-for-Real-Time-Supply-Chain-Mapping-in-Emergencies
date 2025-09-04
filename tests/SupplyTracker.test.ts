import { describe, expect, it, vi, beforeEach } from "vitest";

// Interfaces for type safety
interface ClarityResponse<T> {
  ok: boolean;
  value: T | number; // number for error codes
}

interface SupplyItem {
  owner: string;
  description: string;
  quantity: number;
  initialQuantity: number;
  location: string;
  status: string;
  emergencyId: number;
  createdAt: number;
  lastUpdated: number;
  metadata: string; // buff as string for simplicity
}

interface HistoryEntry {
  timestamp: number;
  updater: string;
  changes: string;
  location: string;
  status: string;
}

interface ContractState {
  paused: boolean;
  admin: string;
  itemCounter: number;
  emergencyActive: boolean;
  supplies: Map<number, SupplyItem>;
  supplyHistory: Map<string, HistoryEntry>; // Key as `${itemId}-${index}`
  supplyHistoryLength: Map<number, number>;
  batchParents: Map<number, number>;
  batchChildren: Map<string, number>; // Key as `${parentId}-${index}`
  batchChildCount: Map<number, number>;
}

// Mock contract implementation
class SupplyTrackerMock {
  private state: ContractState = {
    paused: false,
    admin: "deployer",
    itemCounter: 0,
    emergencyActive: false,
    supplies: new Map(),
    supplyHistory: new Map(),
    supplyHistoryLength: new Map(),
    batchParents: new Map(),
    batchChildren: new Map(),
    batchChildCount: new Map(),
  };

  private ERR_NOT_AUTHORIZED = 100;
  private ERR_INVALID_ITEM = 101;
  private ERR_ALREADY_EXISTS = 102;
  private ERR_INVALID_QUANTITY = 103;
  private ERR_INVALID_STATUS = 104;
  private ERR_INVALID_LOCATION = 105;
  private ERR_PAUSED = 106;
  private ERR_NOT_OWNER = 107;
  private ERR_INVALID_BATCH = 108;
  private ERR_MAX_HISTORY_EXCEEDED = 109;
  private ERR_INVALID_EMERGENCY = 110;

  private MAX_HISTORY_LENGTH = 50;
  private MAX_DESCRIPTION_LEN = 512;
  private MAX_METADATA_LEN = 1024;

  private currentBlockHeight = 1000; // Mock block height, increment on actions

  private incrementBlockHeight() {
    this.currentBlockHeight += 1;
  }

  // Helper to simulate is-valid-participant (always true for tests unless mocked)
  private isValidParticipant(caller: string): boolean {
    return true;
  }

  // Helper to simulate is-oracle (true for "oracle" account)
  private isOracle(caller: string): boolean {
    return caller === "oracle";
  }

  // Helper to simulate is-owner
  private isOwner(caller: string, itemId: number): boolean {
    const item = this.state.supplies.get(itemId);
    return !!item && item.owner === caller;
  }

  getSupplyDetails(itemId: number): ClarityResponse<SupplyItem | null> {
    return { ok: true, value: this.state.supplies.get(itemId) ?? null };
  }

  getHistoryEntry(itemId: number, index: number): ClarityResponse<HistoryEntry | null> {
    const key = `${itemId}-${index}`;
    return { ok: true, value: this.state.supplyHistory.get(key) ?? null };
  }

  getHistoryLength(itemId: number): ClarityResponse<number> {
    return { ok: true, value: this.state.supplyHistoryLength.get(itemId) ?? 0 };
  }

  getBatchParent(childId: number): ClarityResponse<number | null> {
    return { ok: true, value: this.state.batchParents.get(childId) ?? null };
  }

  getBatchChild(parentId: number, index: number): ClarityResponse<number | null> {
    const key = `${parentId}-${index}`;
    return { ok: true, value: this.state.batchChildren.get(key) ?? null };
  }

  getBatchChildCount(parentId: number): ClarityResponse<number> {
    return { ok: true, value: this.state.batchChildCount.get(parentId) ?? 0 };
  }

  isPaused(): ClarityResponse<boolean> {
    return { ok: true, value: this.state.paused };
  }

  getAdmin(): ClarityResponse<string> {
    return { ok: true, value: this.state.admin };
  }

  isEmergencyActive(): ClarityResponse<boolean> {
    return { ok: true, value: this.state.emergencyActive };
  }

  addSupplyItem(
    caller: string,
    description: string,
    quantity: number,
    location: string,
    status: string,
    emergencyId: number,
    metadata: string
  ): ClarityResponse<number> {
    if (this.state.paused) {
      return { ok: false, value: this.ERR_PAUSED };
    }
    if (!this.isValidParticipant(caller)) {
      return { ok: false, value: this.ERR_NOT_AUTHORIZED };
    }
    if (quantity <= 0) {
      return { ok: false, value: this.ERR_INVALID_QUANTITY };
    }
    if (metadata.length > this.MAX_METADATA_LEN) {
      return { ok: false, value: this.ERR_INVALID_ITEM };
    }
    const itemId = this.state.itemCounter + 1;
    if (this.state.supplies.has(itemId)) {
      return { ok: false, value: this.ERR_ALREADY_EXISTS };
    }
    this.state.supplies.set(itemId, {
      owner: caller,
      description,
      quantity,
      initialQuantity: quantity,
      location,
      status,
      emergencyId,
      createdAt: this.currentBlockHeight,
      lastUpdated: this.currentBlockHeight,
      metadata,
    });
    this.state.itemCounter = itemId;
    this.appendHistory(itemId, "Item created", location, status);
    this.incrementBlockHeight();
    return { ok: true, value: itemId };
  }

  updateSupplyItem(
    caller: string,
    itemId: number,
    newLocation: string,
    newStatus: string,
    newQuantity: number
  ): ClarityResponse<boolean> {
    if (this.state.paused) {
      return { ok: false, value: this.ERR_PAUSED };
    }
    const item = this.state.supplies.get(itemId);
    if (!item) {
      return { ok: false, value: this.ERR_INVALID_ITEM };
    }
    if (!this.isOracle(caller) && !this.isOwner(caller, itemId)) {
      return { ok: false, value: this.ERR_NOT_AUTHORIZED };
    }
    if (newQuantity > item.initialQuantity) {
      return { ok: false, value: this.ERR_INVALID_QUANTITY };
    }
    this.state.supplies.set(itemId, {
      ...item,
      location: newLocation,
      status: newStatus,
      quantity: newQuantity,
      lastUpdated: this.currentBlockHeight,
    });
    this.appendHistory(itemId, `Updated: quantity to ${newQuantity}`, newLocation, newStatus);
    this.incrementBlockHeight();
    return { ok: true, value: true };
  }

  transferOwnership(caller: string, itemId: number, newOwner: string): ClarityResponse<boolean> {
    if (this.state.paused) {
      return { ok: false, value: this.ERR_PAUSED };
    }
    const item = this.state.supplies.get(itemId);
    if (!item) {
      return { ok: false, value: this.ERR_INVALID_ITEM };
    }
    if (!this.isOwner(caller, itemId)) {
      return { ok: false, value: this.ERR_NOT_OWNER };
    }
    if (!this.isValidParticipant(newOwner)) {
      return { ok: false, value: this.ERR_NOT_AUTHORIZED };
    }
    this.state.supplies.set(itemId, {
      ...item,
      owner: newOwner,
      lastUpdated: this.currentBlockHeight,
    });
    this.appendHistory(itemId, `Ownership transferred to ${newOwner}`, item.location, item.status);
    this.incrementBlockHeight();
    return { ok: true, value: true };
  }

  splitBatch(caller: string, parentId: number, childQuantities: number[]): ClarityResponse<boolean> {
    if (this.state.paused) {
      return { ok: false, value: this.ERR_PAUSED };
    }
    const parent = this.state.supplies.get(parentId);
    if (!parent) {
      return { ok: false, value: this.ERR_INVALID_ITEM };
    }
    if (!this.isOwner(caller, parentId)) {
      return { ok: false, value: this.ERR_NOT_OWNER };
    }
    const totalChildQuantity = childQuantities.reduce((a, b) => a + b, 0);
    if (totalChildQuantity !== parent.quantity) {
      return { ok: false, value: this.ERR_INVALID_QUANTITY };
    }
    if (this.state.batchChildCount.get(parentId) ?? 0 > 0) {
      return { ok: false, value: this.ERR_ALREADY_EXISTS };
    }
    childQuantities.forEach((quantity, index) => {
      const childId = this.state.itemCounter + 1;
      this.state.supplies.set(childId, {
        owner: parent.owner,
        description: `${parent.description} (Child ${index})`,
        quantity,
        initialQuantity: quantity,
        location: parent.location,
        status: parent.status,
        emergencyId: parent.emergencyId,
        createdAt: this.currentBlockHeight,
        lastUpdated: this.currentBlockHeight,
        metadata: parent.metadata,
      });
      this.state.itemCounter = childId;
      this.state.batchParents.set(childId, parentId);
      const childKey = `${parentId}-${index}`;
      this.state.batchChildren.set(childKey, childId);
      this.appendHistory(childId, "Created as child of parent", parent.location, parent.status);
    });
    this.state.batchChildCount.set(parentId, childQuantities.length);
    this.state.supplies.set(parentId, {
      ...parent,
      status: "split",
      quantity: 0,
      lastUpdated: this.currentBlockHeight,
    });
    this.appendHistory(parentId, "Batch split into children", parent.location, "split");
    this.incrementBlockHeight();
    return { ok: true, value: true };
  }

  mergeBatch(caller: string, parentId: number, childIds: number[]): ClarityResponse<boolean> {
    if (this.state.paused) {
      return { ok: false, value: this.ERR_PAUSED };
    }
    const parent = this.state.supplies.get(parentId);
    if (!parent) {
      return { ok: false, value: this.ERR_INVALID_ITEM };
    }
    if (!this.isOwner(caller, parentId)) {
      return { ok: false, value: this.ERR_NOT_OWNER };
    }
    const childCount = this.state.batchChildCount.get(parentId) ?? 0;
    if (childIds.length !== childCount) {
      return { ok: false, value: this.ERR_INVALID_BATCH };
    }
    let totalQuantity = 0;
    childIds.forEach((childId) => {
      const child = this.state.supplies.get(childId);
      if (child) {
        totalQuantity += child.quantity;
      }
      this.state.supplies.delete(childId);
      this.state.batchParents.delete(childId);
      // Clean history
      const histLen = this.state.supplyHistoryLength.get(childId) ?? 0;
      for (let i = 0; i < histLen; i++) {
        const key = `${childId}-${i}`;
        this.state.supplyHistory.delete(key);
      }
      this.state.supplyHistoryLength.delete(childId);
    });
    // Clean children map
    for (let i = 0; i < childCount; i++) {
      const key = `${parentId}-${i}`;
      this.state.batchChildren.delete(key);
    }
    this.state.batchChildCount.delete(parentId);
    this.state.supplies.set(parentId, {
      ...parent,
      quantity: totalQuantity,
      status: "merged",
      lastUpdated: this.currentBlockHeight,
    });
    this.appendHistory(parentId, "Children merged back", parent.location, "merged");
    this.incrementBlockHeight();
    return { ok: true, value: true };
  }

  verifyDelivery(caller: string, itemId: number, proof: string): ClarityResponse<boolean> {
    if (this.state.paused) {
      return { ok: false, value: this.ERR_PAUSED };
    }
    const item = this.state.supplies.get(itemId);
    if (!item) {
      return { ok: false, value: this.ERR_INVALID_ITEM };
    }
    if (!this.isOracle(caller)) {
      return { ok: false, value: this.ERR_NOT_AUTHORIZED };
    }
    this.state.supplies.set(itemId, {
      ...item,
      status: "delivered",
      lastUpdated: this.currentBlockHeight,
    });
    this.appendHistory(itemId, `Delivery verified with proof${proof}`, item.location, "delivered");
    this.incrementBlockHeight();
    return { ok: true, value: true };
  }

  pauseContract(caller: string): ClarityResponse<boolean> {
    if (caller !== this.state.admin) {
      return { ok: false, value: this.ERR_NOT_AUTHORIZED };
    }
    this.state.paused = true;
    this.incrementBlockHeight();
    return { ok: true, value: true };
  }

  unpauseContract(caller: string): ClarityResponse<boolean> {
    if (caller !== this.state.admin) {
      return { ok: false, value: this.ERR_NOT_AUTHORIZED };
    }
    this.state.paused = false;
    this.incrementBlockHeight();
    return { ok: true, value: true };
  }

  setAdmin(caller: string, newAdmin: string): ClarityResponse<boolean> {
    if (caller !== this.state.admin) {
      return { ok: false, value: this.ERR_NOT_AUTHORIZED };
    }
    this.state.admin = newAdmin;
    this.incrementBlockHeight();
    return { ok: true, value: true };
  }

  activateEmergency(caller: string): ClarityResponse<boolean> {
    if (caller !== this.state.admin) {
      return { ok: false, value: this.ERR_NOT_AUTHORIZED };
    }
    this.state.emergencyActive = true;
    this.incrementBlockHeight();
    return { ok: true, value: true };
  }

  deactivateEmergency(caller: string): ClarityResponse<boolean> {
    if (caller !== this.state.admin) {
      return { ok: false, value: this.ERR_NOT_AUTHORIZED };
    }
    this.state.emergencyActive = false;
    this.incrementBlockHeight();
    return { ok: true, value: true };
  }

  private appendHistory(itemId: number, changes: string, location: string, status: string) {
    const currentLength = this.state.supplyHistoryLength.get(itemId) ?? 0;
    if (currentLength >= this.MAX_HISTORY_LENGTH) {
      return { ok: false, value: this.ERR_MAX_HISTORY_EXCEEDED };
    }
    const key = `${itemId}-${currentLength}`;
    this.state.supplyHistory.set(key, {
      timestamp: this.currentBlockHeight,
      updater: "mock-updater", // In real, tx-sender
      changes,
      location,
      status,
    });
    this.state.supplyHistoryLength.set(itemId, currentLength + 1);
    return { ok: true, value: true };
  }
}

// Test setup
const accounts = {
  deployer: "deployer",
  supplier: "supplier",
  oracle: "oracle",
  user1: "user1",
  user2: "user2",
};

describe("SupplyTracker Contract", () => {
  let contract: SupplyTrackerMock;

  beforeEach(() => {
    contract = new SupplyTrackerMock();
    vi.resetAllMocks();
  });

  it("should initialize with correct defaults", () => {
    expect(contract.isPaused()).toEqual({ ok: true, value: false });
    expect(contract.getAdmin()).toEqual({ ok: true, value: "deployer" });
    expect(contract.isEmergencyActive()).toEqual({ ok: true, value: false });
  });

  it("should allow admin to pause and unpause contract", () => {
    const pauseResult = contract.pauseContract(accounts.deployer);
    expect(pauseResult).toEqual({ ok: true, value: true });
    expect(contract.isPaused()).toEqual({ ok: true, value: true });

    const addDuringPause = contract.addSupplyItem(
      accounts.supplier,
      "Medical Kits",
      100,
      "Warehouse A",
      "stored",
      1,
      "metadata"
    );
    expect(addDuringPause).toEqual({ ok: false, value: 106 });

    const unpauseResult = contract.unpauseContract(accounts.deployer);
    expect(unpauseResult).toEqual({ ok: true, value: true });
    expect(contract.isPaused()).toEqual({ ok: true, value: false });
  });

  it("should prevent non-admin from pausing", () => {
    const pauseResult = contract.pauseContract(accounts.user1);
    expect(pauseResult).toEqual({ ok: false, value: 100 });
  });

  it("should add new supply item with history", () => {
    const addResult = contract.addSupplyItem(
      accounts.supplier,
      "Food Packages",
      500,
      "Port B",
      "stored",
      1,
      "IPFS hash"
    );
    expect(addResult.ok).toBe(true);
    const itemId = addResult.value as number;

    const details = contract.getSupplyDetails(itemId);
    expect(details.value).toEqual(expect.objectContaining({
      owner: accounts.supplier,
      quantity: 500,
      status: "stored",
    }));

    const historyLen = contract.getHistoryLength(itemId);
    expect(historyLen).toEqual({ ok: true, value: 1 });

    const historyEntry = contract.getHistoryEntry(itemId, 0);
    expect(historyEntry.value).toEqual(expect.objectContaining({
      changes: "Item created",
      status: "stored",
    }));
  });

  it("should prevent adding item with invalid quantity", () => {
    const addResult = contract.addSupplyItem(
      accounts.supplier,
      "Invalid",
      0,
      "Location",
      "stored",
      1,
      "metadata"
    );
    expect(addResult).toEqual({ ok: false, value: 103 });
  });

  it("should update supply item by owner or oracle", () => {
    const addResult = contract.addSupplyItem(
      accounts.supplier,
      "Tents",
      200,
      "Base Camp",
      "stored",
      1,
      "metadata"
    );
    const itemId = addResult.value as number;

    const updateByOwner = contract.updateSupplyItem(
      accounts.supplier,
      itemId,
      "En Route",
      "in-transit",
      200
    );
    expect(updateByOwner).toEqual({ ok: true, value: true });

    const details = contract.getSupplyDetails(itemId);
    expect(details.value).toEqual(expect.objectContaining({
      location: "En Route",
      status: "in-transit",
    }));

    const updateByOracle = contract.updateSupplyItem(
      accounts.oracle,
      itemId,
      "Destination",
      "delivered",
      180
    );
    expect(updateByOracle).toEqual({ ok: true, value: true });

    const historyLen = contract.getHistoryLength(itemId);
    expect(historyLen).toEqual({ ok: true, value: 3 }); // Create + 2 updates
  });

  it("should prevent unauthorized update", () => {
    const addResult = contract.addSupplyItem(
      accounts.supplier,
      "Supplies",
      100,
      "Location",
      "stored",
      1,
      "metadata"
    );
    const itemId = addResult.value as number;

    const updateResult = contract.updateSupplyItem(
      accounts.user1,
      itemId,
      "New Location",
      "new-status",
      90
    );
    expect(updateResult).toEqual({ ok: false, value: 100 });
  });

  it("should transfer ownership", () => {
    const addResult = contract.addSupplyItem(
      accounts.supplier,
      "Water Bottles",
      1000,
      "Storage",
      "stored",
      1,
      "metadata"
    );
    const itemId = addResult.value as number;

    const transferResult = contract.transferOwnership(accounts.supplier, itemId, accounts.user2);
    expect(transferResult).toEqual({ ok: true, value: true });

    const details = contract.getSupplyDetails(itemId);
    expect(details.value?.owner).toBe(accounts.user2);
  });

  it("should split batch into children", () => {
    const addResult = contract.addSupplyItem(
      accounts.supplier,
      "Batch Supplies",
      300,
      "Warehouse",
      "stored",
      1,
      "metadata"
    );
    const parentId = addResult.value as number;

    const splitResult = contract.splitBatch(accounts.supplier, parentId, [100, 200]);
    expect(splitResult).toEqual({ ok: true, value: true });

    const parentDetails = contract.getSupplyDetails(parentId);
    expect(parentDetails.value).toEqual(expect.objectContaining({ quantity: 0, status: "split" }));

    const childCount = contract.getBatchChildCount(parentId);
    expect(childCount).toEqual({ ok: true, value: 2 });

    const child1 = contract.getBatchChild(parentId, 0);
    const child1Id = child1.value as number;
    const child1Details = contract.getSupplyDetails(child1Id);
    expect(child1Details.value).toEqual(expect.objectContaining({ quantity: 100 }));

    const parentOfChild1 = contract.getBatchParent(child1Id);
    expect(parentOfChild1).toEqual({ ok: true, value: parentId });
  });

  it("should merge batch back to parent", () => {
    const addResult = contract.addSupplyItem(
      accounts.supplier,
      "Batch Supplies",
      300,
      "Warehouse",
      "stored",
      1,
      "metadata"
    );
    const parentId = addResult.value as number;

    contract.splitBatch(accounts.supplier, parentId, [100, 200]);

    const child1 = contract.getBatchChild(parentId, 0).value as number;
    const child2 = contract.getBatchChild(parentId, 1).value as number;

    const mergeResult = contract.mergeBatch(accounts.supplier, parentId, [child1, child2]);
    expect(mergeResult).toEqual({ ok: true, value: true });

    const parentDetails = contract.getSupplyDetails(parentId);
    expect(parentDetails.value).toEqual(expect.objectContaining({ quantity: 300, status: "merged" }));

    const childCount = contract.getBatchChildCount(parentId);
    expect(childCount).toEqual({ ok: true, value: 0 });

    expect(contract.getSupplyDetails(child1).value).toBeNull();
    expect(contract.getSupplyDetails(child2).value).toBeNull();
  });

  it("should verify delivery by oracle", () => {
    const addResult = contract.addSupplyItem(
      accounts.supplier,
      "Emergency Kits",
      50,
      "Transit",
      "in-transit",
      1,
      "metadata"
    );
    const itemId = addResult.value as number;

    const verifyResult = contract.verifyDelivery(accounts.oracle, itemId, "proof-data");
    expect(verifyResult).toEqual({ ok: true, value: true });

    const details = contract.getSupplyDetails(itemId);
    expect(details.value?.status).toBe("delivered");
  });

  it("should prevent non-oracle from verifying delivery", () => {
    const addResult = contract.addSupplyItem(
      accounts.supplier,
      "Kits",
      50,
      "Transit",
      "in-transit",
      1,
      "metadata"
    );
    const itemId = addResult.value as number;

    const verifyResult = contract.verifyDelivery(accounts.user1, itemId, "proof");
    expect(verifyResult).toEqual({ ok: false, value: 100 });
  });

  it("should activate and deactivate emergency by admin", () => {
    const activateResult = contract.activateEmergency(accounts.deployer);
    expect(activateResult).toEqual({ ok: true, value: true });
    expect(contract.isEmergencyActive()).toEqual({ ok: true, value: true });

    const deactivateResult = contract.deactivateEmergency(accounts.deployer);
    expect(deactivateResult).toEqual({ ok: true, value: true });
    expect(contract.isEmergencyActive()).toEqual({ ok: true, value: false });
  });
});