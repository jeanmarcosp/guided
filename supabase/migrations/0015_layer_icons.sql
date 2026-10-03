-- Layers switch from emoji to SF Symbol icons. Rename the column and map the
-- known legacy emojis to their symbol equivalent; anything unrecognized falls
-- back to the plain pin.
alter table public.layers rename column emoji to icon;

update public.layers
set icon = coalesce(
  case regexp_replace(icon, E'️', '', 'g') -- strip emoji variation selectors
    when E'\U0001F4CD' then 'mappin'                    -- 📍
    when E'\U0001F37D' then 'fork.knife'                -- 🍽️
    when E'\U0001F370' then 'birthday.cake.fill'        -- 🍰
    when E'☕' then 'cup.and.saucer.fill'           -- ☕️
    when E'\U0001F378' then 'wineglass.fill'            -- 🍸
    when E'\U0001F6CD' then 'bag.fill'                  -- 🛍️
    when E'\U0001F3DB' then 'building.columns.fill'     -- 🏛️
    when E'\U0001F333' then 'tree.fill'                 -- 🌳
    when E'\U0001F6CF' then 'bed.double.fill'           -- 🛏️
    when E'\U0001F3A8' then 'paintpalette.fill'         -- 🎨
    when E'\U0001F3B5' then 'music.note'                -- 🎵
    when E'\U0001F3D6' then 'beach.umbrella.fill'       -- 🏖️
    when E'⛰' then 'mountain.2.fill'               -- ⛰️
    when E'\U0001F32E' then 'fork.knife'                -- 🌮
    when E'\U0001F35C' then 'fork.knife'                -- 🍜
    when E'\U0001F377' then 'wineglass.fill'            -- 🍷
    when E'\U0001F4F8' then 'camera.fill'               -- 📸
    when E'⭐' then 'star.fill'                     -- ⭐️
    when E'❤' then 'heart.fill'                    -- ❤️
  end,
  'mappin'
)
where icon !~ '^[a-z0-9.]+$';
