-- 007: Normalize existing user emails (lowercase/trimmed) and PH mobile numbers (+63 9XX-XXX-YYYY)
-- Additive/idempotent data normalization. Never deletes any rows; rows with non-matching phone patterns are left intact.

-- Normalize users.email (skip if lowercased duplicate already exists)
UPDATE "users" u
SET "email" = lower(btrim("email"))
WHERE "email" IS NOT NULL
  AND "email" <> lower(btrim("email"))
  AND NOT EXISTS (
    SELECT 1 FROM "users" u2
    WHERE u2."id" <> u."id"
      AND lower(btrim(u2."email")) = lower(btrim(u."email"))
  );

-- Normalize users.phone to canonical +63 9XX-XXX-YYYY
UPDATE "users"
SET "phone" = '+63 ' || substr(norm_digits, 1, 3) || '-' || substr(norm_digits, 4, 3) || '-' || substr(norm_digits, 7, 4)
FROM (
  SELECT
    "id",
    CASE
      WHEN regexp_replace("phone", '[^0-9]', '', 'g') ~ '^639\d{9}$'
        THEN substring(regexp_replace("phone", '[^0-9]', '', 'g') FROM 3 FOR 10)
      WHEN regexp_replace("phone", '[^0-9]', '', 'g') ~ '^09\d{9}$'
        THEN substring(regexp_replace("phone", '[^0-9]', '', 'g') FROM 2 FOR 10)
      WHEN regexp_replace("phone", '[^0-9]', '', 'g') ~ '^9\d{9}$'
        THEN regexp_replace("phone", '[^0-9]', '', 'g')
      ELSE NULL
    END AS norm_digits
  FROM "users"
  WHERE "phone" IS NOT NULL
    AND "phone" !~ '^\+63 9\d{2}-\d{3}-\d{4}$'
) AS sub
WHERE "users"."id" = sub."id"
  AND sub.norm_digits IS NOT NULL;

-- Normalize addresses.phone to canonical +63 9XX-XXX-YYYY
UPDATE "addresses"
SET "phone" = '+63 ' || substr(norm_digits, 1, 3) || '-' || substr(norm_digits, 4, 3) || '-' || substr(norm_digits, 7, 4)
FROM (
  SELECT
    "id",
    CASE
      WHEN regexp_replace("phone", '[^0-9]', '', 'g') ~ '^639\d{9}$'
        THEN substring(regexp_replace("phone", '[^0-9]', '', 'g') FROM 3 FOR 10)
      WHEN regexp_replace("phone", '[^0-9]', '', 'g') ~ '^09\d{9}$'
        THEN substring(regexp_replace("phone", '[^0-9]', '', 'g') FROM 2 FOR 10)
      WHEN regexp_replace("phone", '[^0-9]', '', 'g') ~ '^9\d{9}$'
        THEN regexp_replace("phone", '[^0-9]', '', 'g')
      ELSE NULL
    END AS norm_digits
  FROM "addresses"
  WHERE "phone" IS NOT NULL
    AND "phone" !~ '^\+63 9\d{2}-\d{3}-\d{4}$'
) AS sub
WHERE "addresses"."id" = sub."id"
  AND sub.norm_digits IS NOT NULL;

-- Normalize orders.shipping_phone to canonical +63 9XX-XXX-YYYY
UPDATE "orders"
SET "shipping_phone" = '+63 ' || substr(norm_digits, 1, 3) || '-' || substr(norm_digits, 4, 3) || '-' || substr(norm_digits, 7, 4)
FROM (
  SELECT
    "id",
    CASE
      WHEN regexp_replace("shipping_phone", '[^0-9]', '', 'g') ~ '^639\d{9}$'
        THEN substring(regexp_replace("shipping_phone", '[^0-9]', '', 'g') FROM 3 FOR 10)
      WHEN regexp_replace("shipping_phone", '[^0-9]', '', 'g') ~ '^09\d{9}$'
        THEN substring(regexp_replace("shipping_phone", '[^0-9]', '', 'g') FROM 2 FOR 10)
      WHEN regexp_replace("shipping_phone", '[^0-9]', '', 'g') ~ '^9\d{9}$'
        THEN regexp_replace("shipping_phone", '[^0-9]', '', 'g')
      ELSE NULL
    END AS norm_digits
  FROM "orders"
  WHERE "shipping_phone" IS NOT NULL
    AND "shipping_phone" !~ '^\+63 9\d{2}-\d{3}-\d{4}$'
) AS sub
WHERE "orders"."id" = sub."id"
  AND sub.norm_digits IS NOT NULL;
