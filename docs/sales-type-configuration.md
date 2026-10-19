# Sales type configuration

Form behavior on Lead, Opportunity, Quotation and Sales Order is driven by the **Type** master. Nothing in the form scripts checks a Type's name or a fixed item group.

## Configure once in Type

A System Manager sets these on each Type. Each checkbox explains on the Type form what it shows:

- Enable Costing and Pricing: shows the **Costing** table with Total Estimated Value and Net Profit on Quotation, and Sale Value, VAT %, Tax %, Difference Value (profit) and Total Quoted / Invoice Value on Sales Order
- Show Additional Items: shows the **Additional Items** table directly under the Quotation items
- Show Vehicle Item
- Show Job Item
- Show Project and Revision Details
- Finished Item Group (optional; blank uses **Jagadamba Settings > Default Finished Item Group**)

The first migration set Oil & Gas to show the job item and pricing, Trailers to show Additional Items and the vehicle item, and Trading to show neither. Upgrading to the Quotation Costing sheet ticks Enable Costing and Pricing on Oil & Gas once. Later migrations keep administrator changes. Renaming a Type does not change its behavior.

## Finished-item filters

Job Item and Vehicle Type on Lead, Opportunity, Quotation and Sales Order, the same links on Project, Project Budget, Work Order, Job Card, Material Request, Purchase Order, Purchase Receipt, Purchase Invoice, Sales Invoice and Stock Entry, and the finished-item links on BOM and Documents only list enabled items that have the document's Type and sit in the Type's Finished Item Group (or the Jagadamba Settings default), including its sub-groups. On the sales documents they are also limited to the document's Company.

The server (`type_settings.finished_item_query`) applies these filters, so they work as soon as the form opens, before the Type settings have loaded. An item only appears when its own **Type** and **Company** fields are filled in on the Item.

## Lead and Prospect

The Equipment Details, Technical Specifications and Requirements & Standards sections show for Types with **Show Job Item** ticked (Oil & Gas).

Lead and Prospect have no **Create > Opportunity** button (Lead also hides **Create > Prospect** and **Add to Prospect**). Quote a Lead with **Create > Quotation**.

## Quotation costing (Oil & Gas)

For a Type with **Enable Costing and Pricing** (Oil & Gas), the Quotation shows a **Costing** table above the items. If it is missing, open **Type > Oil & Gas** and check that box.

| Column | Meaning |
| --- | --- |
| Code | The cost item (Material, Consumable, Labour, Subcontract, Surface Preparation & Painting, Pickling & Passivation …). Only items with **Maintain Stock** unchecked can be picked; saving rejects stock items. |
| Description, Unit | Filled from the item as plain text (the item name when it has no description) and editable. |
| Qty, Unit Price | Entered. |
| Total Price | Qty × Unit Price. |

Below it:

- **Total Estimated Value** = sum of the Costing rows.
- **Net Profit** = Net Total of the Items − Total Estimated Value.

The **Job Item** chosen on the Lead (or Opportunity) is the item being manufactured. When the Quotation is created it is added to the Items table, and selecting or changing the Job Item on the Quotation does the same. Enter the selling rate on that line: it is the quoted amount and drives Net Profit. VAT and other taxes use ERPNext's standard Taxes table.

The Costing table, Total Estimated Value and Net Profit are hidden on prints and recalculated by the server on save.

Example: Costing rows of 50,000 + 1,000 + 20,000 + 10,000 + 2,500 + 750 = 84,250. With the Job Item at 85,750, Net Profit is 1,500.

## Downstream documents

Work Order, Job Card, Material Request, Purchase Order, Purchase Receipt, Purchase Invoice, Sales Invoice and Stock Entry take Type, Vehicle Type and Job Item from their Project, Work Order or Material Request. Opening a form fills only empty fields; choosing a different source overwrites them. The rules live in `sales_flow.js` (`TYPE_SOURCES`).

## Sales Order pricing

For a Type with Enable Costing and Pricing, Total Estimated Value is the order's Net Total. Enter Sale Value without TAX/VAT and the VAT and Tax percentages. Difference Value is Sale Value minus Net Total. Tax Basis chooses whether Tax applies to Sale Value or to Sale Value + VAT. Selecting a Quotation copies its Type, Vehicle Type and Job Item.

## Deployment

```sh
bench --site SITE backup --with-files
cd apps/jagadamba && git pull --ff-only origin main && cd ../..
bench --site SITE migrate
bench build --app jagadamba
bench --site SITE clear-cache
bench restart
```

The desk scripts (`desk.js`, `sales_flow.js`) load through `jagadamba.bundle.js`, so `bench build --app jagadamba` gives them a new file name on every change and browsers pick it up without a manual cache clear.

## Automated validation

```sh
python -m unittest discover -s tests -v
node tests/sales_flow.test.cjs
```
