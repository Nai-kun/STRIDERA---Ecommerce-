# Wireframe Documentation: Checkout & Admin Dashboard

## 1. Multi-Step Checkout Wireframe

```text
+-------------------------------------------------------------------------------+
| STRIDERA  [Lock Icon: Secure 256-bit Encrypted Checkout]                      |
| Steps:  (1) Customer Info  --->  (2) Shipping  --->  (3) Payment  ---> (4) Done|
+-----------------------------------------------+-------------------------------+
| FORM COLUMN                                   | ORDER SUMMARY COLUMN          |
|                                               |                               |
| [Step 1: Contact Details]                     | [Item 1 Thumbnail]            |
| Email Address: [ user@example.com           ] | AeroGlide Velocity (Size 9)   |
| First Name: [ Juan    ] Last Name: [ Dela Cruz] 1x ₱4,599.00                  |
| Mobile Phone: [ +63 917 123 4567            ] |                               |
|                                               | [Promo Code Field]            |
| [Step 2: Philippine Delivery Address]         | [ ENTER CODE ] [ Apply ]      |
| Street Address: [ Unit 12B Horizon Tower    ] |                               |
| City: [ Makati City      ] Province: [ Metro] | Subtotal:          ₱4,599.00  |
| Postal Code: [ 1200 ] Country: [ Philippines] | Shipping (NCR):      ₱150.00  |
|                                               | Discount (STRIDE10):-₱459.90  |
| [Step 3: Payment Method Selector]             | ----------------------------  |
| (•) E-Wallet (GCash, Maya via PayMongo)       | Total:             ₱4,289.10  |
| ( ) Credit / Debit Card                       |                               |
| ( ) Cash on Delivery (Selected Areas)         |                               |
|                                               |                               |
| [Demo Fallback Banner if DEMO_MODE=true]      |                               |
| [CTA BUTTON: PLACE ORDER & PAY NOW (₱4,289.10)]                               |
+-----------------------------------------------+-------------------------------+
```

## 2. Admin Dashboard Wireframe

```text
+-------------------------------------------------------------------------------+
| STRIDERA ADMIN | Dashboard   Products   Orders   Inventory   Promos   [Logout]|
+-------------------------------------------------------------------------------+
| METRICS OVERVIEW                                                              |
| [ Total Revenue: ₱184,500 ] [ Orders: 42 ] [ Pending: 6 ] [ Low Stock: 3 ]   |
+-------------------------------------------------------------------------------+
| RECENT ORDERS MANAGEMENT                                                      |
| Filters: [ All ] [ Paid ] [ Unpaid/Pending ] [ Fulfilled ]                    |
| +----------+-----------------+-------------+---------+-----------+----------+ |
| | Order #  | Customer        | Total (PHP) | Payment | Shipping  | Actions  | |
| +----------+-----------------+-------------+---------+-----------+----------+ |
| | STR-1001 | Maria Santos    | ₱4,599.00   | [PAID]  | Preparing | [View]   | |
| | STR-1002 | Carlo Reyes     | ₱3,899.00   | [PEND]  | Unfulfill | [Verify] | |
| +----------+-----------------+-------------+---------+-----------+----------+ |
+-------------------------------------------------------------------------------+
| INVENTORY MONITORING                                                          |
| Low Stock Alert: STR-AGV-001 (Size 11, Color Volt) has 1 pair remaining       |
+-------------------------------------------------------------------------------+
```
