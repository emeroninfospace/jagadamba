# Sales type configuration

Form behavior on Lead, Opportunity, Quotation and Sales Order is driven by the **Type** master. Nothing in the form scripts checks a Type's name or a fixed item group.

## Configure once in Type

A System Manager sets these on each Type. Each checkbox explains on the Type form what it shows:

- Enable Sales Order Pricing: shows Sale Value, VAT %, Tax %, Difference Value (profit) and Total Quoted / Invoice Value on Sales Order
- Show Additional Items: shows the **Additional Items** table directly under the Quotation items
- Show Vehicle Item
- Show Job Item
- Show Project and Revision Details
- Finished Item Group (optional; blank uses **Jagadamba Settings > Default Finished Item Group**)

The first migration set Oil & Gas to show the job item and pricing, Trailers to show Additional Items and the vehicle item, and Trading to show neither. Later migrations keep administrator changes. Renaming a Type does not change its behavior.

## Finished-item filters

Vehicle Type and Job Item on the sales documents, and the finished-item links on BOM, Designing and Documents, only list enabled items in the Type's Finished Item Group or the Jagadamba Settings default, including that group's sub-groups. On the sales documents they are also limited to the selected Type and Company.

## Quotation

Quotation has no estimation table or pricing calculation. Customer-facing items, taxes and totals use ERPNext's standard fields. Migrating removes the earlier estimation custom fields and the Estimation Cost Code master. Values already stored in those Quotation columns and earlier estimation rows are left in the database.

## Sales Order pricing

For a Type with Enable Sales Order Pricing, Total Estimated Value is the order's Net Total. Enter Sale Value without TAX/VAT and the VAT and Tax percentages. Difference Value is Sale Value minus Net Total. Tax Basis chooses whether Tax applies to Sale Value or to Sale Value + VAT. Selecting a Quotation copies its Type, Vehicle Type and Job Item.

## Deployment

```sh
bench --site SITE backup --with-files
cd apps/jagadamba && git pull --ff-only origin main && cd ../..
bench --site SITE migrate
bench build --app jagadamba
bench --site SITE clear-cache
bench restart
```

## Automated validation

```sh
python -m unittest discover -s tests -v
node tests/sales_flow.test.cjs
```
