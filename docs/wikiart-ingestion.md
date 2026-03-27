# WikiArt (Kaggle) ingestion

Source dataset: [steubk/wikiart on Kaggle](https://www.kaggle.com/datasets/steubk/wikiart) (~34GB unpacked). **Do not commit the raw dataset** to this repository.

## Expected folder layout

The import script supports the common WikiArt directory pattern after unzip:

- **Two-level nesting:** `GenreOrStyle/artist_slug/image.jpg`  
  Example: `Cubism/pablo-picasso/some_work.jpg`
- **One-level nesting:** `artist_slug/image.jpg`  
  Example: `vincent_van_gogh/starry-night.jpg`

Image extensions: `.jpg`, `.jpeg`, `.png`, `.webp`.

Slugs use underscores; they are turned into display titles (e.g. `pablo-picasso` → `Pablo Picasso`).

If your download uses a different root (e.g. an extra `wikiart/` or `data/` folder), set `WIKIART_ROOT` to the directory that **directly** contains the genre or artist folders.

## v1 placement rule

Coordinates come from **artist birthplace** (Wikidata via English Wikipedia), not from the painting file. WikiArt does not provide per-work GPS. Museum name is a synthetic label for the globe (e.g. `{Artist} Birthplace Collection`) consistent with the archive-3 pipeline.

## Target scale

Defaults cap candidates and imports so a laptop can run enrichment without hitting API limits. Raise caps via environment variables when running on a beefier machine.

## Disk and Kaggle

- Reserve **at least** the archive size plus working space (e.g. 40GB+) for a full download.
- Install [Kaggle CLI](https://github.com/Kaggle/kaggle-api), place API credentials in `~/.kaggle/kaggle.json`, then:

  ```bash
  kaggle datasets download -d steubk/wikiart
  unzip wikiart.zip -d ~/Downloads/wikiart-kaggle
  ```

## License and attribution

WikiArt-derived data is often **non-commercial**. Verify the dataset page license and [WikiArt](https://www.wikiart.org/) terms for your use. This pipeline does not embed license text in each artwork record; add attribution in your site footer or about page if required.

## Pipeline (after `WIKIART_ROOT` is set)

```bash
export WIKIART_ROOT="$HOME/Downloads/wikiart-kaggle/path/to/content"
npm run wikiart:import
npm run wikiart:enrich
npm run wikiart:validate
npm run wikiart:upload
npm run wikiart:merge
npm run data:runtime
```

See root `README.md` for Cloudinary vs local image modes.
