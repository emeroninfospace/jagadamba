# Item codes

Item codes follow the store classification sheet: **Category + Group + Sub-group** (2 digits each) and a **4-digit running number** inside the sub-group.

| Category | Group | Sub-group | Running no. | Item code |
| --- | --- | --- | --- | --- |
| 40 Raw Material | 40 Bars, Tube/Pipe & Grating | 60 API Schedule Tube/Pipe | 0069 | `4040600069` |

## Set up once

1. `bench --site SITE migrate` adds **Item Code Prefix** to Item Group.
2. Create the classification tree (3 categories, 16 groups, 65 sub-groups, from `jagadamba/jagadamba/data/item_classification.json`):

   ```sh
   bench --site SITE execute jagadamba.jagadamba.item_code.create_item_groups
   ```

   Groups are named `<prefix> - <description>`, e.g. `404060 - (A.P.I.) SCHEDULE TUBE/PIPE`. Running it again skips groups that already have their prefix. Prefixes can also be typed on any existing Item Group.

3. Import the existing items (Data Import, Item) with their codes from the sheet. The trailing `*` is removed, the code is kept, and each sub-group's counter moves past the highest imported number.

## Creating items

Pick the sub-group as **Item Group**. Item Code becomes read-only and shows the next code; the number is taken when the Item is saved, so two users saving at once never get the same code. Numbers are never reused, so gaps from deleted items stay.

- A typed code is replaced unless it already matches the group's pattern (prefix + 4 digits).
- Item Groups without a prefix keep manual item codes.
- Changing an Item's group later does not rename it.
- Rules on Item Group: the prefix is 2–8 digits, unique, and starts with the parent group's prefix.
- Stock Settings must name items by **Item Code**; naming by Naming Series overrides the generated code.
