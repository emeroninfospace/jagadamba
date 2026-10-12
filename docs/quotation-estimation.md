# Quotation estimation

This update implements the quotation cost table in the estimation department requirements. It also makes the sales form conditions and finished-item filters configurable through the existing **Type** master. It does not implement the PDF's separate dashboards, notifications, or actual job-cost reporting.

## Configure once in Type

A System Manager can change the following on any Type without changing code. Each checkbox explains on the Type form what it shows:

- Enable Estimation Costing: shows the **Estimation** cost table and totals under the Quotation items, and the estimation summary on Sales Order
- Show Additional Items: shows the **Additional Items** table directly under the Quotation items
- Show Vehicle Item
- Show Job Item
- Show Project and Revision Details
- Finished Item Group (optional; blank uses **Jagadamba Settings > Default Finished Item Group**)

The migration initializes existing Oil & Gas with estimation and job fields, Trailers with Additional Items and vehicle fields, and Trading without estimation. So by default only Trailers shows Additional Items, and only Oil & Gas shows the Estimation section. These names occur only in the one-time migration defaults; runtime behavior reads the selected Type's configuration. Renaming a Type does not change its behavior. Later migrations preserve administrator changes. Newly created Types must be configured by the administrator.

Vehicle Type, Job Item and the finished-item links on BOM, Designing and Documents only list items in the Type's Finished Item Group (or the Jagadamba Settings default), including its sub-groups. No item group or Type name is fixed in the form scripts.

Lead technical sections, Opportunity item links, Quotation, and Sales Order use the same configuration. Type changes hide irrelevant fields but do not delete stored estimation rows or additional items.

## Cost codes

Cost heads (for example M Material, C Consumable, L Labour, SC Subcontract, S&P Surface preparation & Painting, P&P Pickling & Passivation) are kept in the **Estimation Cost Code** master with a description and default unit. Picking a code on a Quotation row fills the description and unit, which stay editable on the row. New codes can be created from the row itself. Codes typed on earlier quotations are turned into master records on migrate.

## Enter an estimate

1. Create a Quotation and select its customer, company, currency, and Type.
2. The **Estimation** section appears under the items table only for a Type with Enable Estimation Costing (Oil & Gas by default). Other Types see no estimation fields.
3. Add any number of rows under **Estimation Costs**: Code, Description, Unit, Qty and Unit Price. There are no fixed categories, sample quantities, rates, or tax percentages in the application.
4. Total Price is Qty × Unit Price, rounded to the field's currency precision. Total Estimated Value is the sum of rounded row totals.
5. Below the cost table, enter Sale Value without TAX/VAT and the VAT and Tax percentages. Difference Value (Co Net Profit) is Sale Value minus Total Estimated Value.
6. Select **Tax Basis**: Sale Value, or Sale Value + VAT. Blank legacy values retain the previous compound-tax behavior.
7. When changing or deleting rows, amounts and totals recalculate. Server validation recomputes values on save and rejects negative row costs, invalid numbers, and percentages outside 0–100.

All amounts use the document currency. The estimate is an internal costing worksheet. It does not automatically change ERPNext's standard Items, sales tax rows, discounts, Grand Total, or accounting entries. Maintain the customer-facing items and accounting taxes in those standard fields. The cost table and profit are hidden from standard printing by default; custom print formats should be checked separately.

The reference example contains a VAT arithmetic mismatch. With cost 84,250, sale 85,750, VAT 5%, and tax 10% on Sale Value + VAT, the calculated results are:

| Result | Amount |
| --- | ---: |
| Total estimated cost | 84,250.00 |
| Net profit | 1,500.00 |
| VAT | 4,287.50 |
| Other tax | 9,003.75 |
| Total quoted value | 99,041.25 |

These are test inputs, not application defaults.

## Existing documents and Sales Orders

Cost Basis is hidden on Quotation: new quotations and any quotation with cost rows use Estimation. Existing quotations without cost rows keep their previous Document Net Total basis when saved. Deleting the final row gives zero estimated cost; it does not fall back to sales net total.

Selecting a quotation on Sales Order carries its cost basis, estimated total, sale value, rates, and tax basis. When the order uses Estimation, server validation reads the authorized linked quotation's cost and verifies the Type, Company, Currency, and cancellation status. A Sales Order without a linked quotation can use Document Net Total. Submitted totals are not recalculated merely by opening a form or by migration.

## Deployment

From the bench directory, replace `SITE` with the site name:

```sh
bench --site SITE backup --with-files
cd apps/jagadamba
git pull --ff-only origin main
cd ../..
bench --site SITE migrate
bench build --app jagadamba
bench --site SITE clear-cache
bench restart
```

Migrate is required before using the new client scripts. Existing installations initialize configuration after custom-field sync. Fresh installs use the after-sync hook for the same reason. Setup records a Patch Log marker and only backfills behavior flags; it does not rewrite financial amounts, child rows, workspaces, or accounting data.

Verify on a staging site: Type permissions for sales/estimation users; the three Type layouts; the full-width cost grid; new, saved, amended, and submitted quotations; the corrected example; currency precision; quotation-to-order mapping; existing customized print formats; and standard quotation submission/invoice totals.

## Automated validation

```sh
python -m unittest discover -s tests -v
node tests/sales_flow.test.cjs
```

The isolated Python and JavaScript checks cover costing, source permissions, configuration, migration idempotence, metadata layout, and asynchronous lookup behavior. They do not replace an installed ERPNext site's database migration and browser smoke test.
