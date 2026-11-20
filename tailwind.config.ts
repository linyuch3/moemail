import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

const config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        sidebar: "hsl(var(--sidebar))",
        "avatar-blue": "hsl(var(--avatar-blue))",
        "avatar-blue-ink": "hsl(var(--avatar-blue-ink))",
        "avatar-green": "hsl(var(--avatar-green))",
        "avatar-green-ink": "hsl(var(--avatar-green-ink))",
        "avatar-amber": "hsl(var(--avatar-amber))",
        "avatar-amber-ink": "hsl(var(--avatar-amber-ink))",
        "avatar-rose": "hsl(var(--avatar-rose))",
        "avatar-rose-ink": "hsl(var(--avatar-rose-ink))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      fontSize: {
        xs: ["var(--font-caption)", { lineHeight: "1rem" }],
        sm: ["var(--font-body)", { lineHeight: "1.25rem" }],
        lg: ["var(--font-heading)", { lineHeight: "1.375rem" }],
        xl: ["var(--font-title)", { lineHeight: "1.75rem" }],
      },
      spacing: {
        3: "var(--space-panel)",
        4: "var(--space-reader)",
        panel: "var(--panel-height)",
        appbar: "var(--appbar-height)",
      },
      maxWidth: {
        "mail-body": "var(--mail-body-width)",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', '"Segoe UI"', 'sans-serif'],
        zpix: ['var(--font-zpix)'],
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;

export default config;
