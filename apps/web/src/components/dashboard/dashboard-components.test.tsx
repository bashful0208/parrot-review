import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";

import DashboardHero from "./DashboardHero";
import DashboardQuickActions from "./DashboardQuickActions";
import RecentReviewRuns from "./RecentReviewRuns";
import RiskInsights from "./RiskInsights";
import RepositoryHealthList from "./RepositoryHealthList";
import AdminSidebar from "./AdminSidebar";
import AdminShell from "./AdminShell";
import AdminTopbar from "./AdminTopbar";
import MobileSidebarSheet from "./MobileSidebarSheet";
import OverviewContent from "./OverviewContent";
import { buildDashboardViewModel } from "@/lib/dashboard/view-model";

const model = buildDashboardViewModel({
  id: "user_123",
  email: "sasha@example.com",
  name: "Sasha",
});

test("dashboard hero renders organization context", () => {
  const markup = renderToStaticMarkup(<DashboardHero hero={model.hero} />);

  assert.match(markup, /Acme Engineering/);
  assert.match(markup, /Sasha/);
});

test("admin shell renders overview navigation and primary action", () => {
  const markup = renderToStaticMarkup(
    <AdminShell
      shell={model.shell}
      topbar={model.topbar}
      viewerName={model.hero.viewerName}
    >
      <OverviewContent dashboard={model} />
    </AdminShell>
  );

  assert.match(markup, /Overview/);
  assert.match(markup, /Repositories/);
  assert.match(markup, /Review Runs/);
  assert.doesNotMatch(markup, /Search repositories, runs, or rules/);
  assert.match(markup, /New Review/);
});

test("admin shell renders skip link and marks the active navigation item", () => {
  const markup = renderToStaticMarkup(
    <AdminShell
      shell={model.shell}
      topbar={model.topbar}
      viewerName={model.hero.viewerName}
    >
      <OverviewContent dashboard={model} />
    </AdminShell>
  );

  assert.match(markup, /Skip to overview content/);
  assert.match(markup, /id="overview-content"/);
  assert.match(markup, /aria-current="page"[^>]*>.*Overview/);
});

test("dashboard logout actions submit a POST form", () => {
  const shellMarkup = renderToStaticMarkup(
    <AdminShell
      shell={model.shell}
      topbar={model.topbar}
      viewerName={model.hero.viewerName}
    >
      <OverviewContent dashboard={model} />
    </AdminShell>
  );
  const mobileMarkup = renderToStaticMarkup(
    <MobileSidebarSheet shell={model.shell} viewerName={model.hero.viewerName} />
  );

  assert.match(shellMarkup, /<form action="\/api\/auth\/logout" method="post">/);
  assert.match(mobileMarkup, /<form action="\/api\/auth\/logout" method="post">/);
});

test("mobile sidebar exposes a real expandable navigation control", () => {
  const markup = renderToStaticMarkup(
    <MobileSidebarSheet shell={model.shell} viewerName={model.hero.viewerName} />
  );

  assert.match(markup, /aria-expanded="false"/);
  assert.match(markup, /aria-controls="mobile-navigation"/);
  assert.match(markup, /id="mobile-navigation"/);
});

test("desktop sidebar leaves display control to the caller", () => {
  const markup = renderToStaticMarkup(
    <AdminSidebar
      shell={model.shell}
      viewerName={model.hero.viewerName}
      className="hidden lg:flex"
    />
  );

  assert.match(markup, /<aside class="[^"]*hidden lg:flex[^"]*"/);
  assert.doesNotMatch(markup, /<aside class="[^"]*\bflex\b[^"]*hidden lg:flex/);
  assert.match(markup, /<aside class="[^"]*lg:sticky[^"]*lg:h-dvh[^"]*lg:overflow-y-auto[^"]*"/);
});

test("topbar primary action does not nest a button inside a link", () => {
  const markup = renderToStaticMarkup(<AdminTopbar topbar={model.topbar} />);

  assert.doesNotMatch(markup, /<a[^>]*>\s*<button/);
  assert.match(markup, /href="\/api\/reviews\/enqueue"/);
});

test("quick actions render the three approved entry points", () => {
  const markup = renderToStaticMarkup(
    <DashboardQuickActions actions={model.quickActions} />
  );

  assert.match(markup, /New Review/);
  assert.match(markup, /Connect Repository/);
  assert.match(markup, /View All Runs/);
});

test("activity and insight modules render review content", () => {
  const runsMarkup = renderToStaticMarkup(
    <RecentReviewRuns runs={model.recentRuns} />
  );
  const insightsMarkup = renderToStaticMarkup(
    <RiskInsights insights={model.insights} trend={model.trend} />
  );
  const repositoryMarkup = renderToStaticMarkup(
    <RepositoryHealthList repositories={model.repositories} />
  );

  assert.match(runsMarkup, /PR #184/);
  assert.match(insightsMarkup, /Risk insights/);
  assert.match(repositoryMarkup, /reviewer\/web/);
});

test("recent review runs shows an empty state when no runs exist", () => {
  const markup = renderToStaticMarkup(<RecentReviewRuns runs={[]} />);

  assert.match(markup, /Start your first review/);
});

test("repository health shows a connect CTA when no repositories exist", () => {
  const markup = renderToStaticMarkup(
    <RepositoryHealthList repositories={[]} />
  );

  assert.match(markup, /Connect Repository/);
});
