# Quotation estimation

This update implements the quotation cost table in the estimation department requirements. It also makes the sales form conditions and finished-item filters configurable through the existing **Type** master. It does not implement the PDF's separate dashboards, notifications, or actual job-cost reporting.

## Configure once in Type

A System Manager can change the following on any Type without changing code:

- Enable Estimation Costing
- Show Additional Items
- Show Vehicle Item
- Show Job Item
- Show Project and Revision Details
- Finished Item Group (optional; blank removes the item-group restriction)

The migration initializes existing Oil & Gas with estimation and job fields, Trailers with Additional Items and vehicle fields, and Trading without estimation. It uses an existing Finished Items group if available. These names occur only in the one-time migration defaults; runtime behavior reads the selected Type's configuration. Renaming a Type does not change its behavior. Later migrations preserve administrator changes. Newly created Types must be configured by the administrator.

Lead technical sections, Opportunity item links, Quotation, and Sales Order use the same configuration. Type changes hide irrelevant fields but do not delete stored estimation rows or additional items.

## Enter an estimate

1. Create a Quotation and select its customer, company, currency, and Type.
2. For an estimation-enabled Type, use **Cost Basis: Estimation**.
3. Add any number of rows under **Estimation Costs**: Code, Description, Unit, Quantity, and Unit Cost. Codes and descriptions are free-form, units come from the UOM master, and there are no fixed categories, sample quantities, rates, or tax percentages in the application.
4. Total Cost is Quantity × Unit Cost, rounded to the field's currency precision. Total Estimated Value is the sum of rounded row costs.
5. Enter Sale Value without TAX/VAT and the applicable percentages. Net Profit is Sale Value minus Total Estimated Value.
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

Existing quotations without cost rows retain their previous Document Net Total cost basis when saved. New quotations default to Estimation. Selecting Estimation with no rows gives zero estimated cost; deleting the final row does not fall back to sales net total. A document cannot use Document Net Total while retaining estimation rows, to avoid silently excluding entered costs.

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
