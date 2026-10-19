# Sales type configuration

Form behavior on Lead, Opportunity, Quotation and Sales Order is driven by the **Type** master. Nothing in the form scripts checks a Type's name or a fixed item group.

## Configure once in Type

A System Manager sets these on each Type. Each checkbox explains on the Type form what it shows:

- Enable Costing and Pricing: shows the **Costing** sheet on Quotation and the Sale Value, VAT %, Tax %, Difference Value (profit) and Total Quoted / Invoice Value summary on Quotation and Sales Order
- Show Additional Items: shows the **Additional Items** table directly under the Quotation items
- Show Vehicle Item
- Show Job Item
- Show Project and Revision Details
- Finished Item Group (optional; blank uses **Jagadamba Settings > Default Finished Item Group**)

The first migration set Oil & Gas to show the job item and pricing, Trailers to show Additional Items and the vehicle item, and Trading to show neither. Later migrations keep administrator changes. Renaming a Type does not change its behavior.

## Finished-item filters

Job Item and Vehicle Type on Lead, Opportunity, Quotation and Sales Order, the same links on Project, Project Budget, Work Order, Job Card, Material Request, Purchase Order, Purchase Receipt, Purchase Invoice, Sales Invoice and Stock Entry, and the finished-item links on BOM and Documents only list enabled items that have the document's Type and sit in the Type's Finished Item Group (or the Jagadamba Settings default), including its sub-groups. On the sales documents they are also limited to the document's Company.

The server (`type_settings.finished_item_query`) applies these filters, so they work as soon as the form opens, before the Type settings have loaded. An item only appears when its own **Type** and **Company** fields are filled in on the Item.

## Lead and Prospect

The Equipment Details, Technical Specifications and Requirements & Standards sections show for Types with **Show Job Item** ticked (Oil & Gas).

Lead and Prospect have no **Create > Opportunity** button (Lead also hides **Create > Prospect** and **Add to Prospect**). Quote a Lead with **Create > Quotation**.

## Quotation costing (Oil & Gas)

For a Type with **Enable Costing and Pricing** (Oil & Gas), the Quotation shows a **Costing** sheet above the items:

| Column | Meaning |
| --- | --- |
| Code | The cost item (Material, Consumable, Labour, Subcontract, Surface Preparation & Painting, Pickling & Passivation …). Description and Unit are fetched from the item and can be edited. |
| Qty, Unit Price | Entered. |
| Total Price | Qty × Unit Price. |

Below it:

- **Total Estimated Value** = sum of the Costing rows.
- **Sale Value without TAX/VAT** = Net Total of the Items table.
- **Difference Value (Co Net Profit)** = Sale Value − Total Estimated Value.
- **VAT Amount** = Sale Value × VAT %.
- **Tax Amount** = (Sale Value + VAT) × Tax %, or Sale Value × Tax % when Tax Basis is Sale Value.
- **Total Quoted / Invoice Value** = Sale Value + VAT + Tax.

The **Job Item** is the item being manufactured, so selecting it adds it to the Items table (filling an empty row or adding one with qty 1). Enter its selling rate there; that rate drives the Sale Value. Changing the Job Item swaps the item on that row; clearing it leaves the Items table as it is.

The Costing sheet, Total Estimated Value and Difference Value are hidden on prints. The server recalculates every amount on save.

Example: Costing rows of 50,000 + 1,000 + 20,000 + 10,000 + 2,500 + 750 = 84,250. With the Job Item at 85,750, the Difference Value is 1,500; at 5 % VAT and 10 % Tax, VAT is 4,287.50, Tax is 9,003.75 and the Total Quoted Value is 99,041.25.

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
