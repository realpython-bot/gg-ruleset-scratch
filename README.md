# Generic Grocery Co. website

The website of Generic Grocery Co., a family-owned neighborhood grocery store at
214 Main Street. It has produce, a bakery and a deli counter, and it's open every day,
with shorter hours on Sundays.

The site is HTML, CSS and JavaScript modules, run and built with [Vite](https://vite.dev/).

## Run it

You need Node.js, which comes with npm. Install the project's packages once:

```console
npm install
```

Then start Vite's dev server, and open the address it prints in VS Code's integrated
browser:

```console
npm run dev
```

The pickup page needs the store's publishable Generic Curbside key. Copy `.env.example`
to `.env` and put the key (`curb_pub_...`) in it. `.env` stays out of Git.

The dev server runs as long as that command does. `npm run build` writes the site to
`dist/`, the folder to publish, and `npm run preview` serves that build so you can check
it first. `npm run check` reports on the repository.

## Where things are

| File                                                                         | What it is                                                                         |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `index.html`, `deals.html`, `departments.html`, `pickup.html`, `turkey.html` | The five pages                                                                     |
| `css/styles.css`                                                             | All the styles                                                                     |
| `src/data/hours.js`                                                          | The weekly opening hours                                                           |
| `src/data/holidays.js`                                                       | Holiday hours, by date                                                             |
| `src/data/deals.js`                                                          | This week's deals. Prices are in cents                                             |
| `src/data/turkey.js`                                                         | Christmas turkey pre-orders: the price, the sizes and the pickup days              |
| `src/lib/hours.js`                                                           | Works out the hours for a date, and whether the store is open                      |
| `src/lib/prices.js`                                                          | Formats prices for the pages                                                       |
| `src/lib/badge.js`                                                           | The text of the home page's "Open now" badge                                       |
| `src/lib/deals.js`                                                           | Whether a deal week is on, on a given date                                         |
| `src/lib/closing-soon.js`                                                    | The home page's "Closing soon" notice                                              |
| `src/lib/turkey.js`                                                          | The pre-order deadline and the price by weight                                     |
| `src/home.js`, `src/deals-page.js`, `src/turkey-page.js`                     | Fill in the home page, the deals page and the turkey page                          |
| `scripts/check.js`                                                           | Checks the project's Git repository: `npm run check`                               |
| `package.json`, `package-lock.json`                                          | The packages the site needs, and their exact versions                              |
| `vite.config.js`                                                             | Tells Vite to build all five pages, not only `index.html`                          |
| `.gitignore`                                                                 | Keeps untracked files, such as `notes.txt`, out of Git                             |
| `.prettierrc`, `.prettierignore`                                             | Prettier's settings, and the files it leaves as they are                           |
| `eslint.config.js`                                                           | ESLint's rules, and which files it checks                                          |
| `.github/workflows/check.yml`                                                | The check every pull request into `main` runs                                      |
| `src/vendor/curbside.js`                                                     | A stand-in for Generic Curbside's pickup widget: `mountCurbside(element, { key })` |
| `src/pickup.js`                                                              | Puts Generic Curbside's widget on the pickup page, with the key from `.env`        |
| `.env.example`                                                               | The values `.env` needs, with a placeholder instead of the key                     |

Weekly deals run from Wednesday to Tuesday, like the printed weekly ad.

## To do

The work arrives as issues on the project's GitHub repository. Every change goes
through a pull request into `main`, and the pull request that finishes an issue closes
it, with `Closes #` and the issue's number in its description.

Every pull request into `main` runs the check in `.github/workflows/check.yml`: lint,
formatting and the build, as on your computer.
