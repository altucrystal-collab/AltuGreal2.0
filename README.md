# Altu Greal - Point of Sale System

A modern, responsive Point of Sale system built with Next.js 14, TypeScript, Tailwind CSS, and Supabase.

![Altu Greal](https://img.shields.io/badge/Altu%20Greal-v2.0.0-B3855D)

## Features

- **🔐 Role-Based Access**
  - Owner: Full access to all features
  - Cashier: Sales only

- **🛒 Sales**
  - Multi-product cart system
  - Product selection with image preview
  - Out-of-stock detection (products with insufficient ingredients are disabled)
  - Customer type selection
  - Payment method selection
  - Dine In/Takeout option
  - Customer payment and change calculation
  - Real-time checkout with transaction numbers (YY-MM-XXXXX format)

- **📊 Reports**
  - Daily sales reports with transaction grouping
  - Date range selection
  - Editable Report Date for earnings tracking
  - Multi-select archive with CSV export

- **📦 Inventory**
  - Inventory item management with image upload
  - Product creation from ingredients
  - Stock tracking by weight (kg), quantity (pcs), or volume (L/ml)
  - Automatic ingredient deduction on sales
  - Cost per unit calculation

- **💰 Earnings**
  - Daily profit calculations
  - Revenue, item expenses, and profit summary
  - OPEX (Operating Expenses) tracking
  - Remaining OPEX calculation with break-even detection
  - Net profit shows only after monthly OPEX is covered
  - Pie charts: Customer types, Payment methods, Dine In/Takeout
  - Line graphs for date range analysis

- **📋 OPEX**
  - Monthly operating expenses management
  - Add/edit/delete expense items
  - Total monthly OPEX calculation

- **⚙️ Settings**
  - Custom payment methods with colors
  - Custom customer types with colors
  - Logout functionality

- **🔔 Notifications**
  - Storage warning (Supabase free tier)
  - New purchase alerts with 1-minute cancel window

## Tech Stack

- **Frontend**: Next.js 14, React 18, TypeScript
- **Styling**: Tailwind CSS
- **Database**: Supabase (PostgreSQL)
- **Storage**: Supabase Storage
- **Charts**: Chart.js + react-chartjs-2
- **Notifications**: react-hot-toast
- **Image Compression**: browser-image-compression

## Setup Instructions

### 1. Clone and Install

```bash
git clone https://github.com/altucrystal-collab/AltuGreal2.0.git
cd AltuGreal2.0
npm install
```

### 2. Create Environment File

Create a `.env.local` file in the project root:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 3. Setup Supabase Database

1. Create a new [Supabase Project](https://supabase.com/dashboard)
2. Navigate to **SQL Editor**
3. Copy the contents of `altu-greal-schema.sql` and run it
4. Create a storage bucket:
   - Go to **Storage** in the sidebar
   - Click **New bucket**
   - Name: `product-images`
   - Check **Public bucket**
   - Click **Create bucket**
   - Add policies for public read, upload, and delete

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Login Credentials

| Role    | Username | Password   |
|---------|----------|------------|
| Owner   | owner    | owner123   |
| Cashier | cashier  | cashier123 |

## Deploying to Vercel

### Option 1: GitHub Integration (Recommended)

1. Push your code to GitHub
2. Go to [Vercel](https://vercel.com)
3. Click **Add New Project**
4. Import your GitHub repository
5. Add environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
6. Click **Deploy**

### Option 2: Vercel CLI

```bash
# Install Vercel CLI
npm i -g vercel

# Login to Vercel
vercel login

# Deploy
vercel

# For production deployment
vercel --prod
```

## Project Structure

```
AltuGreal2.0/
├── src/
│   ├── app/
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   └── providers.tsx
│   ├── components/
│   │   ├── Dashboard.tsx
│   │   ├── LoginPage.tsx
│   │   ├── Navigation.tsx
│   │   ├── NotificationBar.tsx
│   │   └── pages/
│   │       ├── EarningsPage.tsx
│   │       ├── InventoryPage.tsx
│   │       ├── OPEXPage.tsx
│   │       ├── ReportsPage.tsx
│   │       ├── SalesPage.tsx
│   │       └── SettingsPage.tsx
│   ├── contexts/
│   │   ├── AuthContext.tsx
│   │   └── NotificationContext.tsx
│   ├── lib/
│   │   └── supabase.ts
│   └── types/
│       └── database.ts
├── altu-greal-schema.sql    # Complete database schema
├── truncate-data.sql        # Script to clear all data
├── package.json
├── tailwind.config.js
└── README.md
```

## Database Schema

For new instances, run the single schema file `altu-greal-schema.sql` in your Supabase SQL Editor. This contains all tables, functions, triggers, RLS policies, and default data.

## Supabase Free Tier Limits

- **Database**: 500MB
- **Storage**: 1GB
- **Bandwidth**: 2GB/month
- **API Requests**: Unlimited

The app includes a storage warning notification when approaching limits.

## License

MIT License

---

Built with ❤️ by Altu Crystal
