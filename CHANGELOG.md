# Changelog

## [0.4.0](https://github.com/michal-kocarek/tsc-after/compare/v0.3.0...v0.4.0) (2026-11-21)

### Features

* clean outputs using program-aware project configuration ([26c301e](https://github.com/michal-kocarek/tsc-after/commit/26c301eb7be6c28e255b55cc1a6cb50e15d0d77c))
* expand TypeScript compatibility and streamline CI matrix ([3922f20](https://github.com/michal-kocarek/tsc-after/commit/3922f20217b56fb94e90d85468e56656f3dcc5aa))
* list planned removals and accurate summary in --dry output ([8a7e8ba](https://github.com/michal-kocarek/tsc-after/commit/8a7e8ba643517a1cff0751002f1efbb1f596682c)), closes [#8](https://github.com/michal-kocarek/tsc-after/issues/8)
* support TypeScript 7.1 with compiler adapters ([8898ee2](https://github.com/michal-kocarek/tsc-after/commit/8898ee2427e8982f423118121ec33f3473771608))

### Bug Fixes

* require rootDir for TypeScript 3.9 through 4.1 ([f18acde](https://github.com/michal-kocarek/tsc-after/commit/f18acde6b726d720674826f7485ce69fa406d0d3))
* synchronize shell lint dependencies in lockfile ([a87db44](https://github.com/michal-kocarek/tsc-after/commit/a87db4429e63e20567a1fb46d5f628e2d4c1f35e))

## [0.3.0](https://github.com/michal-kocarek/tsc-after/compare/v0.2.0...v0.3.0) (2026-11-21)

### ⚠ BREAKING CHANGES

* update command line options and syntax to resemble tsc options more closer

### Features

* argument --project accepts project directories as well like tsc ([2277813](https://github.com/michal-kocarek/tsc-after/commit/227781389e9c9a1ee983b3b79609b0e9f5164ba5))
* update command line options and syntax to resemble tsc options more closer ([3990ee5](https://github.com/michal-kocarek/tsc-after/commit/3990ee5d6a68b3f7c749c488dbf5ae23096039e2))

### Bug Fixes

* handle missing outDir without crashing ([c8d5147](https://github.com/michal-kocarek/tsc-after/commit/c8d51473c972a8bc9934650d73716785b533d9b8))
* prevent cleanup of source-containing outDir ([80dea32](https://github.com/michal-kocarek/tsc-after/commit/80dea32f97d958fe1d66ff05e5c84937a37c5d52))
* prevent cleanup through symbolic links ([699e512](https://github.com/michal-kocarek/tsc-after/commit/699e5125d49ceff1f00d2d53d15d5f06a657dced))

## 0.2.0 (2026-10-20)

### Features

* Add initial app implementation as quick'n'dirty PoC ([febdd8a](https://github.com/michal-kocarek/tsc-after/commit/febdd8af5437728f37bc6ce8dfe09769079adf0b))

### Bug Fixes

* Fix failure ([18ad764](https://github.com/michal-kocarek/tsc-after/commit/18ad7649b0b800701659b180395864515ae40743))
* Fix lint errors ([11e9ed5](https://github.com/michal-kocarek/tsc-after/commit/11e9ed5d3680b2006144d8b547622c14668f868d))
* Permissions for the contributors workflow ([1b886fe](https://github.com/michal-kocarek/tsc-after/commit/1b886fe3d5561b5f54fbfb3b4c69f53d71b12744))
* Permissions for the contributors workflow ([c56dc55](https://github.com/michal-kocarek/tsc-after/commit/c56dc556820924966e84c1b5dfcac75f9b9b3144))
* Typos in naming ([e8fa4f0](https://github.com/michal-kocarek/tsc-after/commit/e8fa4f023b85c1f4b6094068fc0ed86618ca7985))
