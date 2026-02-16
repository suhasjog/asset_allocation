# Portfolio Analyzer

A React-based web application for analyzing investment portfolios by uploading Fidelity Guided Portfolio Summary (GPS) CSV exports. Visualize asset allocation, account breakdown, holdings distribution, and more with interactive charts.

## See it in action : https://suhasjog.github.io/asset_allocation/

A sample dummy-portfolio is includeded in the exmaple, to get the feel for the UI

## Features

- **CSV Upload**: Import your Fidelity GPS portfolio export
- **Asset Allocation**: View allocation across US Equity, Intl Equity, US Bonds, Intl Bonds, Fixed Income, and Cash
- **Account Analysis**: Break down holdings by account type (401K, Roth IRA, Taxable, etc.)
- **Holdings View**: See all positions consolidated or by individual account
- **Style Analysis**: Morningstar style box classification
- **Search & Filter**: Find holdings across all accounts
- **Interactive Charts**: Pie charts, bar charts, and detailed tables
- **Client-Side Processing**: All data is processed locally—nothing is uploaded to any server

## Prerequisites

- **Node.js 20.19+** or **Node.js 22.12+** (required by Vite)
- **npm** (included with Node.js)

### Using nvm (Recommended)

If you have [nvm](https://github.com/nvm-sh/nvm) installed:

```bash
nvm install 20
nvm use 20
```

## Installation

1. **Clone or navigate to the project directory:**
   ```bash
   cd  SOURCE_DIRECTORY/assset_allocation
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

## Running the App

### Development Server

Start the Vite development server with hot module reloading:

```bash
npm run dev
```

The app will be available at:
- **Local**: http://localhost:5173/
- **Network**: (use `--host` flag if needed)

### Build for Production

Generate an optimized production build:

```bash
npm run build
```

Output will be in the `dist/` directory.

### Deploy to GitHub Pages

1. **Initialize a git repository** (if not already done):
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/YOUR_USERNAME/asset_allocation.git
   git branch -M main
   git push -u origin main
   ```

2. **Enable GitHub Pages** in your repository settings:
   - Go to Settings → Pages
   - Set source to **Deploy from a branch**
   - Select **`gh-pages` branch**

3. **Deploy using the deploy script**:
   ```bash
   npm run deploy
   ```

   This will build the app, create a `gh-pages` branch, and push the `dist/` folder to GitHub Pages.

4. **Access your app** at:
   ```
   https://YOUR_USERNAME.github.io/asset_allocation/
   ```

### Preview Production Build

Test the production build locally:

```bash
npm run preview
```

## Project Structure

```
.
├── src/
│   ├── main.jsx              # App entry point
│   ├── App.jsx               # Root component (re-exports analyzer)
│   ├── portfolio_analyzer.jsx # Main Portfolio Analyzer component
│   ├── index.css             # Global styles + Tailwind directives
│   ├── App.css               # Component styles (if needed)
│   └── assets/               # Static assets
├── index.html                # HTML entry point
├── package.json              # Dependencies and scripts
├── vite.config.js            # Vite configuration
├── tailwind.config.cjs       # Tailwind CSS configuration
├── postcss.config.cjs        # PostCSS configuration
└── public/                   # Public assets
```

## Dependencies

### Runtime
- **react** (^19.2.0) – UI framework
- **react-dom** (^19.2.0) – React DOM rendering
- **recharts** (^3.7.0) – Charts and visualizations
- **papaparse** (^5.5.3) – CSV parsing

### Development
- **vite** (^7.3.1) – Build tool and dev server
- **@vitejs/plugin-react** – React Fast Refresh plugin
- **tailwindcss** (^3.4.8) – Utility-first CSS framework
- **postcss** (^8.4.24) – CSS post-processor
- **autoprefixer** (^10.4.14) – CSS vendor prefixing

## How to Use the App

1. **Open** http://localhost:5173/ in your browser
2. **Upload** your Fidelity GPS CSV file (drag & drop or click to browse)
   - **Sample Portfolio**: A sample file (`sample-portfolio.csv`) is included in the project root for testing. Upload it to see the analyzer in action with ~$6M portfolio across multiple accounts (John Doe and Jill Doe)
3. **View Analysis**:
   - **Overview**: Key metrics and top holdings
   - **By Asset Class**: Breakdown by investment type (US Equity, Intl Equity, US Bonds, Intl Bonds, Cash)
   - **By Account**: Distribution across accounts (Traditional IRA, Roth IRA, 401K, Taxable)
   - **By Holding**: Consolidated view of all positions
   - **By Style**: Morningstar style classification
   - **All Holdings**: Searchable table of all positions

## Tailwind CSS

The app uses [Tailwind CSS](https://tailwindcss.com/) for styling. Tailwind utility classes are configured in:
- `src/index.css` – Imports Tailwind directives
- `tailwind.config.cjs` – Configuration
- `postcss.config.cjs` – PostCSS pipeline

## Environment & Node Version

This project requires **Node.js ≥ 20.19.0** to run Vite and all dev tools. Check your version:

```bash
node -v
```

If using nvm:
```bash
nvm use 20
```

## Troubleshooting

### "Vite requires Node.js version 20.19+ or 22.12+"
Ensure you're using Node 20.19.0 or later. Use nvm to switch versions if needed.

### CSV Import Issues
- Ensure your file is a Fidelity GPS export (.csv format)
- Check that the CSV contains the required columns: Symbol, Description, Account, etc.
- The app will display detailed error messages if parsing fails

### Port 5173 Already in Use
Vite will automatically try the next available port. Check the terminal output for the correct URL.

## License

This project is provided as-is for personal portfolio analysis.

## Notes

- All portfolio data is processed **locally in your browser**—no data is sent to any server
- The app is optimized for desktop and tablet views
- Supports modern browsers (Chrome, Firefox, Safari, Edge)
