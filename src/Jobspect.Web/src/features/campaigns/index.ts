// The client-safe surface. The query that reads campaigns lives in ./server,
// because everything here is imported by Client Components.
export { type Campaign } from "./campaign";
export { CampaignSwitcher } from "./components/campaign-switcher";
export { campaignScopeOptions, campaignScopeParsers, isScopedPath, SCOPED_PATHS } from "./scope";
export { useCampaignScope } from "./use-campaign-scope";
