# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-12-31

### Added

- English and Spanish README, MIT license, contributing guide and security policy.
- `X-Processing-Time` header and processing time shown on each result.
- Security headers on every response.

### Changed

- Dependency versions are bounded to avoid breaking major upgrades.

### Fixed

- First request in Docker no longer waits ~60 s for Numba to recompile `pymatting`.

## [0.4.0] - 2025-10-29

### Added

- Production Docker image with Gunicorn, non-root user, health check and preloaded model.
- Docker Compose file with a persistent volume for models.
- pytest suite and ruff configuration.
- GitHub Actions workflow: lint, tests on Python 3.11–3.13 and Docker build with smoke test.

## [0.3.0] - 2025-08-27

### Added

- Redesigned interface with settings panel, drop zone and results gallery.
- Per-image processing with status, retry and batch progress.
- Before/after comparison slider.
- Client-side ZIP download of all results.
- Dark mode, persisted settings and paste from clipboard.

## [0.2.0] - 2025-06-26

### Added

- `/api/remove`, `/api/models` and `/health` endpoints.
- Model selection, PNG/WebP/JPG output, solid background color and auto-crop.
- Alpha matting for fine edges and maximum size option.

### Changed

- The rembg model session is created once and reused.

### Fixed

- Phone photos keep their EXIF orientation.
- Duplicate file names no longer overwrite each other inside the ZIP.
- Invalid or unsupported files are reported instead of silently skipped.

## [0.1.0] - 2025-03-21

### Added

- First version: Flask app that removes the background from one or more images and returns a PNG or a ZIP.

[1.0.0]: https://github.com/David-Raffo/Img-background-remover/compare/v0.4.0...v1.0.0
[0.4.0]: https://github.com/David-Raffo/Img-background-remover/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/David-Raffo/Img-background-remover/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/David-Raffo/Img-background-remover/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/David-Raffo/Img-background-remover/releases/tag/v0.1.0
