WITH parsed AS (
  SELECT
    id,
    replace(
      regexp_replace(
        replace(
          (regexp_match(replace(title, chr(160), ' '), '([0-9][0-9 .,]*)[[:space:]]*m²'))[1],
          ' ',
          ''
        ),
        '[[:space:]]+',
        '',
        'g'
      ),
      ',',
      '.'
    )::numeric AS parsed_area
  FROM public.properties
  WHERE source = 'sreality'
    AND title IS NOT NULL
    AND replace(title, chr(160), ' ') ~ '([0-9][0-9 .,]*)[[:space:]]*m²'
),
updated AS (
  UPDATE public.properties p
  SET area_m2 = parsed.parsed_area,
      price_per_m2 = CASE
        WHEN COALESCE(p.price, 0) > 1 AND parsed.parsed_area > 0 THEN ROUND((p.price::numeric / parsed.parsed_area))
        ELSE NULL
      END
  FROM parsed
  WHERE p.id = parsed.id
    AND (
      p.area_m2 IS DISTINCT FROM parsed.parsed_area
      OR p.price_per_m2 IS DISTINCT FROM CASE
        WHEN COALESCE(p.price, 0) > 1 AND parsed.parsed_area > 0 THEN ROUND((p.price::numeric / parsed.parsed_area))
        ELSE NULL
      END
    )
  RETURNING p.id, p.title, p.area_m2, p.price_per_m2
)
SELECT count(*) AS updated_count FROM updated;
