# Item codes

Item codes follow the client's store classification (STORE.xlsx): **Category + Group + Sub-group** (2 digits each) and a **4-digit running number** inside the sub-group. It applies to Items whose **Type** has **Auto Item Code** ticked; migrating ticks it once on Trailers.

| Category | Group | Sub-group | Running no. | Item code |
| --- | --- | --- | --- | --- |
| 40 Raw Material | 40 Bars, Tube/Pipe & Grating | 60 API Schedule Tube/Pipe | 0069 | `4040600069` |

## Set up once

1. `bench --site SITE migrate` adds **Item Code Prefix** to Item Group and **Auto Item Code** to Type (ticked on Trailers).
2. Create the classification tree: the active entries of the sheet's sub-group table, 6 categories (FG, SFG, ACC, RM, BO, CU), 37 groups and 127 sub-groups, from `jagadamba/jagadamba/data/item_classification.json`:

   ```sh
   bench --site SITE execute jagadamba.jagadamba.item_code.create_item_groups
   ```

   Groups are named `<prefix> - <description>`, e.g. `404060 - (A.P.I.) SCHEDULE TUBE/PIPE`. Running it again skips groups that already have their prefix. Prefixes can also be typed on any existing Item Group.

3. Import the existing items with **Data Import > Item > Insert New Records** using the prepared file (Item Code, Item Name, Item Group, Default Unit of Measure, Description, Maintain Stock, Type = Trailers, Company). Fill the Company column first and make sure the UOMs it uses exist. The codes are kept (without `*`) and each sub-group's counter moves past the highest imported number.

## Item form (Trailers)

For a Type with Auto Item Code the first column of the Item form reads, top to bottom:

| Field | Meaning |
| --- | --- |
| Type | Trailers |
| Material Category Description | e.g. `(RM) Raw Material` |
| Mat Group Description | e.g. `HR/CR SHEET & PLATE` |
| Mat Sub-Group Description | the Item Group, e.g. `MS Sheet & Plate` (the Item Group field is relabelled for Trailers) |

Each list only offers entries under the one above it, and only classification groups (those on the path of a sub-group with an Item Code Prefix). Picking a sub-group fills its group and category; on save the server sets both from the sub-group, so they always match. Item Code and Item Name sit in the second column. Other Types see the usual Item Group field and no category/group fields.

Migrating fills Material Category and Mat Group once on existing Trailers items.

## Creating items

Select **Type** Trailers and the sub-group as **Item Group** (Type sits next to Item Group). Item Code becomes read-only and shows the next code; the number is taken when the Item is saved, so two users saving at once never get the same code. Numbers are never reused, so gaps from deleted items stay.

- A typed code is replaced unless it already matches the group's pattern (prefix + 4 digits).
- Other Types, and Item Groups without a prefix, keep manual item codes.
- Changing an Item's group later does not rename it.
- Rules on Item Group: the prefix is 2–8 digits, unique, and starts with the parent group's prefix.
- Stock Settings must name items by **Item Code**; naming by Naming Series overrides the generated code.
