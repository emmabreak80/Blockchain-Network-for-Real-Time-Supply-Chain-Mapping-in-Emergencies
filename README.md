# 🚨 Blockchain Network for Real-Time Supply Chain Mapping in Emergencies

Welcome to a decentralized platform that revolutionizes emergency response! This Web3 project uses blockchain to enable real-time mapping of supply chains during crises, allowing international organizations, governments, and relief agencies to coordinate seamlessly without data silos. By leveraging the Stacks blockchain and Clarity smart contracts, it ensures transparent, tamper-proof tracking of supplies from origin to delivery, solving the real-world problem of fragmented information in humanitarian emergencies—like natural disasters or conflicts—where delays can cost lives.

## ✨ Features

🗺 Real-Time Mapping: Track supplies (e.g., food, medicine, tents) with GPS-integrated updates, visualized on-chain for all participants.
🤝 Silo-Free Coordination: Permissionless access for verified entities to view and update shared ledgers, fostering international collaboration.
⚡ Emergency Activation: Quick deployment of virtual "emergency zones" to aggregate and allocate resources dynamically.
🔒 Immutable Transparency: All movements, requests, and deliveries logged on-chain to prevent fraud and ensure accountability.
📡 Oracle Integration: Pull real-world data (e.g., IoT sensors, satellite imagery) for accurate, up-to-date status.
🛡️ Secure Access Controls: Role-based permissions to protect sensitive data while enabling broad participation.
📊 Analytics Dashboard: On-chain queries for supply forecasts, bottleneck detection, and post-event audits.

## 🛠 How It Works

This project utilizes 8 Clarity smart contracts on the Stacks blockchain to create a robust, decentralized network. It integrates with off-chain oracles for real-time inputs, ensuring supplies are mapped and coordinated without centralized bottlenecks.

### Core Smart Contracts
1. **NetworkRegistry.clar**: Registers participants (e.g., NGOs, governments, suppliers) with verified identities and roles. Handles onboarding and permission assignments.
2. **EmergencyFactory.clar**: Creates and manages emergency events, defining zones, timelines, and required supply types. Deploys child contracts for specific crises.
3. **SupplyTracker.clar**: Tracks individual items or batches with unique IDs, updating locations, statuses (e.g., in-transit, delivered), and quantities in real-time via oracle feeds.
4. **RequestCoordinator.clar**: Facilitates supply requests from affected areas and matches them with available resources from participants, using automated allocation logic.
5. **OracleFeeder.clar**: Interfaces with external oracles (e.g., for GPS, weather data) to submit verified real-world updates to the blockchain, triggering smart contract events.
6. **GovernanceCouncil.clar**: Enables multi-party voting on critical decisions, like resource reallocations or emergency extensions, weighted by participant stakes or reputations.
7. **AuditTrail.clar**: Logs all transactions, updates, and interactions immutably, with query functions for audits and compliance reporting.
8. **DisputeResolver.clar**: Handles conflicts (e.g., delivery disputes) through on-chain arbitration, using evidence from oracles and logs to resolve issues fairly.

**For Relief Coordinators (e.g., UN Agencies, Governments)**  
- Declare an emergency via `create-emergency` on EmergencyFactory, specifying affected zones and needs.  
- Submit requests using RequestCoordinator, which broadcasts to the network for fulfillment.  
- Monitor real-time maps by querying SupplyTracker and OracleFeeder for updates.  

**For Suppliers and Logistics Providers**  
- Register via NetworkRegistry and add supplies to SupplyTracker with initial hashes and metadata.  
- Update item statuses (e.g., shipped, arrived) through oracle-verified calls, ensuring chain-of-custody.  
- Respond to requests in RequestCoordinator, with automatic transfers upon verification.  

**For Verifiers and Auditors**  
- Access AuditTrail for full transaction history and use DisputeResolver for any discrepancies.  
- Participate in GovernanceCouncil votes to approve major changes or fund releases if integrated.  
- Query analytics across contracts for insights into supply chain efficiency.  

Boom! In an emergency, this network activates instantly, mapping supplies across borders without silos—ensuring aid reaches where it's needed most, with every step verifiable and collaborative.

## 🚀 Getting Started
Clone the repo, deploy the Clarity contracts to the Stacks testnet, and connect to oracles (e.g., via Chainlink-inspired Clarity adapters). Build a frontend (e.g., with React and Hiro Wallet) for mapping visualizations using on-chain data. Integrate IoT devices for automated updates to make it truly real-time! This transforms chaotic relief efforts into efficient, trustless operations.