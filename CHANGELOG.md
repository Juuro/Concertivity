# Changelog

All notable changes to this project will be documented in this file. Version bumps, tags, and GitHub Releases are automated with [Release Please](https://github.com/googleapis/release-please) from [Conventional Commits](https://www.conventionalcommits.org/) merged to `main`.

## [1.3.0](https://github.com/Juuro/Concertivity/compare/concertivity-v1.2.0...concertivity-v1.3.0) (2026-09-12)


### Features

* **admin:** add resend verification email for unverified users ([#291](https://github.com/Juuro/Concertivity/issues/291)) ([bf087fd](https://github.com/Juuro/Concertivity/commit/bf087fd8e206461b6d5a49d54065a8173e11a8a0))
* **admin:** show user registration states on users page ([#289](https://github.com/Juuro/Concertivity/issues/289)) ([e962af7](https://github.com/Juuro/Concertivity/commit/e962af730fb2429ccbfa48fb6eeb4b05ca42836d))
* **concerts:** add AI-assisted concert memory search ([#288](https://github.com/Juuro/Concertivity/issues/288)) ([ce4b0d6](https://github.com/Juuro/Concertivity/commit/ce4b0d63410f8adccc9c7c431dd978d870c5773e))
* **concerts:** log ai search no-results to sentry ([#293](https://github.com/Juuro/Concertivity/issues/293)) ([4ba0a7a](https://github.com/Juuro/Concertivity/commit/4ba0a7af2afe3bbefff58995202f82345b30e1a7))


### Bug Fixes

* **ai-search:** avoid wrong city when geocoding setlist venues ([#304](https://github.com/Juuro/Concertivity/issues/304)) ([2c745eb](https://github.com/Juuro/Concertivity/commit/2c745eb56da761bb488ce069cfa3452f8364a1f2))
* **auth:** handle getSession failures on server-rendered pages ([#298](https://github.com/Juuro/Concertivity/issues/298)) ([a83cb9c](https://github.com/Juuro/Concertivity/commit/a83cb9c840993e2475796bf32072c1f4b7a5809c))
* **concert-card:** improve future badge ([#335](https://github.com/Juuro/Concertivity/issues/335)) ([ee271be](https://github.com/Juuro/Concertivity/commit/ee271be8f3a77cc11836315cfadfb804514c2327))
* **deps:** resolve all open dependabot alerts ([#342](https://github.com/Juuro/Concertivity/issues/342)) ([c55576d](https://github.com/Juuro/Concertivity/commit/c55576df9fd042d27fd490bf2ed7b56bfe4582cf))
* **prisma:** read database url at runtime on next 16 builds ([#300](https://github.com/Juuro/Concertivity/issues/300)) ([87652ad](https://github.com/Juuro/Concertivity/commit/87652ad05bb34118017377d670bcfb6e56d65482))
* **prisma:** route serverless runtime through Accelerate, fix DB connection ([#303](https://github.com/Juuro/Concertivity/issues/303)) ([2614f52](https://github.com/Juuro/Concertivity/commit/2614f52f8ba091a76ae43c0244d550f173c78beb))
* **repo:** stop tracking auto-generated next-env.d.ts ([#309](https://github.com/Juuro/Concertivity/issues/309)) ([af25c87](https://github.com/Juuro/Concertivity/commit/af25c878e46212196e971c91bc71bd49b07c5df9))
* **test:** restore typecheck compatibility ([#336](https://github.com/Juuro/Concertivity/issues/336)) ([3252669](https://github.com/Juuro/Concertivity/commit/3252669c80c8838f6faae7200ea90582ead1f7b9))

## [1.2.0](https://github.com/Juuro/Concertivity/compare/concertivity-v1.1.0...concertivity-v1.2.0) (2026-05-11)


### Features

* add multi-tenancy with Better Auth and Prisma ([#157](https://github.com/Juuro/Concertivity/issues/157)) ([f96bd2c](https://github.com/Juuro/Concertivity/commit/f96bd2c081fe3bf228cd0dfe9bca6b41725f853d))
* Add standard-version. ([0d36e1e](https://github.com/Juuro/Concertivity/commit/0d36e1e0faead3c460e68ebadbb8f425b429f7e8))
* band page ([a911ceb](https://github.com/Juuro/Concertivity/commit/a911ceb085fc5ef05442e6bf316eeee5443b6f46))
* city statistics ([#129](https://github.com/Juuro/Concertivity/issues/129)) ([4afe5e4](https://github.com/Juuro/Concertivity/commit/4afe5e4de3c19cb14585bb4aa13a6bae440d5fd7))
* concert count component ([7ff256b](https://github.com/Juuro/Concertivity/commit/7ff256b0b3be024ccbae5a7454f9e171d3543a59))
* filter view for years ([#65](https://github.com/Juuro/Concertivity/issues/65)) ([48f0649](https://github.com/Juuro/Concertivity/commit/48f06499a9679cdc37176ee64621b335e5b1609d))
* Get that image right. ([354c8f5](https://github.com/Juuro/Concertivity/commit/354c8f5884cd41dcc96adfb4118642ea36345285))
* integrate Photon reverse geocoding and update environment configuration ([#153](https://github.com/Juuro/Concertivity/issues/153)) ([451f4bc](https://github.com/Juuro/Concertivity/commit/451f4bc473c074246561c487e6fddac7087c5e28))
* **map:** Leaflet map & support bands ([c960497](https://github.com/Juuro/Concertivity/commit/c960497d099da1e9dbf5c24a37208d91347e0769))
* **map:** Leaflet map & support bands ([76e8725](https://github.com/Juuro/Concertivity/commit/76e8725e371aa6c3f67e0a8fa439964bfaafe1c9))
* Maps ([c96ea00](https://github.com/Juuro/Concertivity/commit/c96ea00e389d3b5b1b6bfef61922ff1b0684237f))
* re-enable last.fm during build ([#152](https://github.com/Juuro/Concertivity/issues/152)) ([7f72420](https://github.com/Juuro/Concertivity/commit/7f72420c2634533610de102765d692fb6b7c9c6f))
* statistics widget ([#44](https://github.com/Juuro/Concertivity/issues/44)) ([87571fb](https://github.com/Juuro/Concertivity/commit/87571fb78ae888f44738d0acf3a1880450bdc17d))
* Styling. Without Bootstrap. ([ab478aa](https://github.com/Juuro/Concertivity/commit/ab478aac14c520d55ec5522e2aa0c1ddfc110e64))
* Typescript ([#151](https://github.com/Juuro/Concertivity/issues/151)) ([9446bba](https://github.com/Juuro/Concertivity/commit/9446bba85fd3e8f6e2abd9286f56ac34d4fda9e7))
* Use openstage geocoder from personal GitHub repository. ([77a0cd3](https://github.com/Juuro/Concertivity/commit/77a0cd39d962ec2b4952f452c50988353ae43482))


### Bug Fixes

* badge ([573b70b](https://github.com/Juuro/Concertivity/commit/573b70b1ca6fac9e37613b1a9a7da32fc79794bf))
* band page title ([#37](https://github.com/Juuro/Concertivity/issues/37)) ([40ec81f](https://github.com/Juuro/Concertivity/commit/40ec81f245200db85882871165cd49ab5ce66fdb))
* category headline not centered ([#66](https://github.com/Juuro/Concertivity/issues/66)) ([d1a3155](https://github.com/Juuro/Concertivity/commit/d1a3155f91f864f3fbce7b0fca513a17449face9))
* claude-code-review.yml ([#235](https://github.com/Juuro/Concertivity/issues/235)) ([a43e4b4](https://github.com/Juuro/Concertivity/commit/a43e4b473ba762c055612b0d48aa5d08c54bd1e9))
* concert card heading too high ([#67](https://github.com/Juuro/Concertivity/issues/67)) ([2f675ed](https://github.com/Juuro/Concertivity/commit/2f675edb701480e13c2909592abd02a7ae7614b6))
* Don't checkin yarn.lock. ([ed7a832](https://github.com/Juuro/Concertivity/commit/ed7a83217a453381a35ac340701065a4fadf0384))
* enhance Content Security Policy in proxy for PostHog integration ([d59348f](https://github.com/Juuro/Concertivity/commit/d59348f56ac1613a98147d2b86df837ec5ae9b8e))
* false stats ([#113](https://github.com/Juuro/Concertivity/issues/113)) ([0947840](https://github.com/Juuro/Concertivity/commit/0947840835380b32cdac3ed1b13c95d667666eff))
* map icon anchor ([#117](https://github.com/Juuro/Concertivity/issues/117)) ([fcd8986](https://github.com/Juuro/Concertivity/commit/fcd8986d22ab704eccaa2f24a7a6f0a3e6e01a20))
* migration to Next.js ([50c50f3](https://github.com/Juuro/Concertivity/commit/50c50f36c1243f30599ac5f24699a63188871fb5))
* mobile views ([190abaa](https://github.com/Juuro/Concertivity/commit/190abaa4a8306fff580fb8b79fdbf5e021b5ac82))
* mobile views ([a9b934d](https://github.com/Juuro/Concertivity/commit/a9b934d026b4d53fc07781b2a4bfb436935719af))
* stats widget column width ([#60](https://github.com/Juuro/Concertivity/issues/60)) ([62ec340](https://github.com/Juuro/Concertivity/commit/62ec340fe8c038aa06ea03f97893b22f879e5570))
* update pull request permissions to write in Claude Code Review workflow ([74f8b4c](https://github.com/Juuro/Concertivity/commit/74f8b4cf4f4a797d614fac4de0af674bac10c9ef))
* update TicketmasterVenueSchema to handle optional city name ([2d7744c](https://github.com/Juuro/Concertivity/commit/2d7744c0e0100c689bc43d16886573ac00ff145d))
* use mock data only optionally ([#118](https://github.com/Juuro/Concertivity/issues/118)) ([e83ca3d](https://github.com/Juuro/Concertivity/commit/e83ca3d87cebf70b56add0b2da56786848bb9b4c))
* wide on mobile ([#41](https://github.com/Juuro/Concertivity/issues/41)) ([9c90ddb](https://github.com/Juuro/Concertivity/commit/9c90ddbbda56f25e9bfb17a0f17124ccb16e023b))
* word break ([#109](https://github.com/Juuro/Concertivity/issues/109)) ([8cb0f4d](https://github.com/Juuro/Concertivity/commit/8cb0f4db6339ef0fe4e890cd5d9eb4c5c493c670))

## [Unreleased]

Changes since the last release are described by commit messages on `main` until the next Release Please release PR is merged.

## [1.0.0](https://github.com/Juuro/Concertivity/compare/v0.3.0...v1.0.0) (2022-12-03)


### Features

* band page ([a911ceb](https://github.com/Juuro/Concertivity/commit/a911ceb085fc5ef05442e6bf316eeee5443b6f46))
* concert count component ([7ff256b](https://github.com/Juuro/Concertivity/commit/7ff256b0b3be024ccbae5a7454f9e171d3543a59))
* geacoding without gatsby plugin ([7ccea63](https://github.com/Juuro/Concertivity/commit/7ccea63ed96baf4cc352a2fad698153b826504e1))
* Get that image right. ([354c8f5](https://github.com/Juuro/Concertivity/commit/354c8f5884cd41dcc96adfb4118642ea36345285))
* **map:** Leaflet map & support bands ([76e8725](https://github.com/Juuro/Concertivity/commit/76e8725e371aa6c3f67e0a8fa439964bfaafe1c9))


### Bug Fixes

* badge ([573b70b](https://github.com/Juuro/Concertivity/commit/573b70b1ca6fac9e37613b1a9a7da32fc79794bf))
* band page title ([#37](https://github.com/Juuro/Concertivity/issues/37)) ([40ec81f](https://github.com/Juuro/Concertivity/commit/40ec81f245200db85882871165cd49ab5ce66fdb))
* mobile views ([a9b934d](https://github.com/Juuro/Concertivity/commit/a9b934d026b4d53fc07781b2a4bfb436935719af))
* prettier ([468e0d1](https://github.com/Juuro/Concertivity/commit/468e0d1d06d793e3e28dc2db80d6371a86ea418f))
* upgrade prettier ([2aa04c8](https://github.com/Juuro/Concertivity/commit/2aa04c86272547b1d03998904e404491410f74f4))

## [0.3.0](https://github.com/Juuro/Concertivity/compare/v0.2.0...v0.3.0) (2019-06-15)

### Features

- Styling. Without Bootstrap. ([ab478aa](https://github.com/Juuro/Concertivity/commit/ab478aa))

## [0.2.0](https://github.com/Juuro/Concertivity/compare/v0.1.0...v0.2.0) (2019-06-14)

### Bug Fixes

- Don't checkin yarn.lock. ([ed7a832](https://github.com/Juuro/Concertivity/commit/ed7a832))

### Features

- Add standard-version. ([0d36e1e](https://github.com/Juuro/Concertivity/commit/0d36e1e))
- Use openstage geocoder from personal GitHub repository. ([77a0cd3](https://github.com/Juuro/Concertivity/commit/77a0cd3))

## 0.1.0 (2019-06-14)
