import { GlobalRegistrator } from "@happy-dom/global-registrator";

// Registers `window`, `document`, etc. into globals before any test runs so
// React Testing Library can render components into a real DOM tree.
GlobalRegistrator.register();
