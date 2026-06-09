-- Echelix knowledge corpus — products, services, references, ICP rules.
-- Read by the email drafter and scoring; editable from the web UI.

create table if not exists public.echelix_offerings (
  id           uuid primary key default gen_random_uuid(),
  slug         text unique not null,
  kind         text not null check (kind in ('product','service','pilot')),
  name         text not null,
  one_liner    text,
  description  text,
  capabilities text[] default '{}',
  target_industries text[] default '{}',
  value_props text[] default '{}',
  engagement_model text,
  pricing      text,
  signal_triggers text[] default '{}',  -- relevance_tags / keywords that should surface this offering
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.echelix_references (
  id           uuid primary key default gen_random_uuid(),
  customer_name text not null,
  industry     text,
  rotation_bucket text,           -- maps to our 5 buckets when applicable
  framing_text text,              -- exact line to use in the brief's "Why Echelix" card 1
  work_pattern text,              -- what we actually did (multi-agent, data foundation, etc.)
  is_public    boolean default true,  -- safe to name in outreach?
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ICP lives as a single jsonb in engine_config — easier to edit holistically.
insert into public.engine_config (key, value, description) values (
  'icp',
  jsonb_build_object(
    'tiers', jsonb_build_array(
      jsonb_build_object('tier','A','revenue_min',500000000,'revenue_max',2000000000,
        'description','Sweet spot — 60-120 day cycle. Mid-market multi-site operational complexity at the digital-physical seam.'),
      jsonb_build_object('tier','B','revenue_min',2000000000,'revenue_max',5000000000,
        'description','Strategic, larger deals, 6-9 month cycle. Premier MS accounts.'),
      jsonb_build_object('tier','C','revenue_min',1000000000,'revenue_max',5000000000,
        'description','Early in AI maturity but moving fast. Smaller initial deals.')
    ),
    'positive_signals', jsonb_build_array(
      'active or recently-stalled Copilot pilot',
      'Azure AI Foundry / Azure OpenAI / Fabric purchase or expansion',
      'new CIO/CDO/VP Ops in seat under 18 months',
      'earnings or press mention of throughput / downtime / OEE / SLA / compliance / real-time visibility',
      'open job posting for AI engineer, data engineer, AI program manager',
      'D365 / M365 E3/E5 footprint',
      'PE backing or public listing',
      'plant modernization / digital transformation press',
      'recent M&A integration in flight',
      'capex commitment named with timing'
    ),
    'disqualifiers', jsonb_build_array(
      'pure SaaS / software / digital-native',
      'sub-$300M revenue',
      'AWS-primary or GCP-primary stack',
      'no Copilot/Azure AI/Fabric pilot in past 12 months',
      'no identifiable internal champion',
      '"AI strategy" research without implementation budget',
      '18+ months into stalled engagement with a bigger SI on same problem'
    ),
    'target_buyer_titles', jsonb_build_array(
      'COO','CIO','CFO','VP Operations','Director of Operations',
      'Sr Director of Application Innovation','Director of Data','Director of AI',
      'VP IT','Head of Digital','Director of Manufacturing IT','VP Commercial'
    ),
    'industry_sweet_spots', jsonb_build_array(
      'Industrial and process manufacturing (packaging, paper, chemicals, building products)',
      'Mobility and transportation services (tolling, fleet, parking, violations)',
      'Distributed services (deathcare, multi-location physical services, field services)',
      'Energy (utilities, oil and gas operations, renewables)',
      'Logistics (3PL, freight, last-mile)'
    )
  ),
  'Echelix Ideal Customer Profile. Drives scoring boosts and qualification gate at brief time.'
) on conflict (key) do update set value = excluded.value, description = excluded.description, updated_at = now();

-- Seed offerings
insert into public.echelix_offerings (slug, kind, name, one_liner, description, capabilities, target_industries, value_props, engagement_model, pricing, signal_triggers) values
('lattice', 'product', 'Echelix Lattice',
  'Pre-built, code-defined Azure foundation. 2-4 weeks to first workload.',
  'Enterprise Azure infrastructure platform (Bicep IaC). Private VNet, AKS, Azure OpenAI/AI Search/Form Recognizer, Service Bus agent messaging (9 dedicated channels), Key Vault, App Insights. Multi-agent coordination native, not bolted on.',
  ARRAY['Bicep IaC','AKS compute','Azure OpenAI','AI Search RAG','Service Bus agent messaging','Multi-agent coordination','OWASP Agentic AI compliance','Purview integration'],
  ARRAY['manufacturing','oil_and_gas','utilities','distribution_transportation','financial_services','other'],
  ARRAY['2-4 weeks vs 6-12 months DIY','AI-agent infrastructure built in','Modular — fits existing Azure or greenfield','Enterprise-grade security by default'],
  'Discovery → Architecture Review → 2-4 week PoC → Production rollout',
  NULL,
  ARRAY['azure','foundry','aks','infrastructure','platform','greenfield','tech_stack']),

('cortex', 'product', 'Echelix Cortex',
  'The intelligence layer for Microsoft 365. AI on top of Email/Teams/SharePoint.',
  'Sits on top of M365 via Microsoft Graph. 5-step flow: Listen → Normalize → Analyze → Act → Govern. Email Intelligence, Teams Analysis, SharePoint Processing, Task Automation, AI Agent, Semantic Search. 70% reduction in manual email processing, ~95% task detection accuracy.',
  ARRAY['Email intelligence','Teams analysis','SharePoint processing','Task automation','AI agent (multi-turn)','RAG semantic search','Purview integration','Salesforce auto-logging'],
  ARRAY['financial_services','other'],
  ARRAY['70% reduction in manual email processing','~95% task detection accuracy','<1 sec event latency','Zero manual CRM data entry','OWASP Agentic AI compliant'],
  'Entra ID app → Azure provision via IaC → Microservices deploy → Configure → Activate within days',
  NULL,
  ARRAY['microsoft','m365','sharepoint','teams','copilot','crm','salesforce','task','email']),

('opportunity_mapping', 'service', 'AI Opportunity Mapping',
  'A guided session that maps where AI creates real value in your business.',
  'Workshop to cut through hype, pinpoint high-value AI use cases, deliver a clear roadmap. Outputs: defined personas, current-state value stream map, future-state storyboard, agent architecture, sample concepts, prioritized roadmap.',
  ARRAY['Persona definition','Value stream mapping','Future-state storyboarding','Agent architecture design','Roadmap prioritization'],
  ARRAY['manufacturing','oil_and_gas','utilities','distribution_transportation','financial_services','other'],
  ARRAY['Accelerate decision-making','Minimize risk','Maximize ROI','Reduce costly rework','Increase stakeholder buy-in'],
  'Guided workshop session',
  NULL,
  ARRAY['ai_strategy','roadmap','explore','digital_transformation']),

('risk_framework', 'service', 'AI Adoption & Risk Framework',
  'Adopt AI with confidence, control, and accountability.',
  'Structured governance policies, oversight tools, compliance templates. Replaces guesswork with proven policies for orgs eager to scale AI but missing the guardrails.',
  ARRAY['Governance policies','Compliance templates','Oversight tools','Bias and security checks','Repeatable structure'],
  ARRAY['financial_services','manufacturing','utilities','other'],
  ARRAY['Clear policies & guardrails','Faster, safer adoption','Built-in compliance tools','Bias and security checks'],
  'Framework rollout engagement',
  NULL,
  ARRAY['governance','compliance','risk','policy','regulation','audit']),

('embedded_agent_pilot', 'pilot', 'Embedded Agent Pilot',
  'Fixed-fee, outcome-based, 60-day pilot. The standard outreach engagement.',
  'Standing engagement model paired with industry briefs. We embed with your team for 60 days, ship a working agent against a named KPI on Foundry Agent Service.',
  ARRAY['Embedded team for 60 days','Outcome-based KPI commitment','Lattice foundation','Foundry Agent Service deployment','Microsoft Agent Framework'],
  ARRAY['manufacturing','oil_and_gas','utilities','distribution_transportation','financial_services','other'],
  ARRAY['Fixed-fee predictability ($75K-$150K)','60 days to a measurable outcome','Built on Foundry Agent Service','Lattice foundation in 2-4 weeks'],
  '60-day fixed-fee embedded engagement, outcome-based on a named KPI',
  '$75K-$150K fixed fee',
  ARRAY['pilot','poc','proof_of_concept','copilot','foundry','agent'])
on conflict (slug) do nothing;

-- Seed reference engagements (from brief skill credibility anchor logic)
insert into public.echelix_references (customer_name, industry, rotation_bucket, framing_text, work_pattern, is_public) values
('ProPetro Services', 'Oil & Gas (Permian pressure pumping)', 'oil_and_gas',
  'Microsoft-funded agentic AI engagement in the Permian for a major service company',
  'Multi-agent system for frac operations', true),
('Clearwater Paper', 'Process manufacturing (paperboard)', 'manufacturing',
  'Currently executing a Microsoft Fabric–based Pricing AI MVP with Fabric Copilot Data Agents at a publicly traded paperboard manufacturer',
  'Microsoft Fabric data foundation + Pricing AI with Fabric Copilot Data Agents', true),
('Pretium Packaging', 'Discrete manufacturing ($1B+ rigid plastic containers)', 'manufacturing',
  'Currently embedded as Microsoft Fabric data foundation lead at a $1B+ discrete plastic containers manufacturer, preparing for Copilot and agentic AI workloads on top',
  'Microsoft Fabric data foundation lead, preparing for Copilot + agentic workloads', true),
('Verra Mobility', 'Mobility (enterprise smart-mobility platform)', 'distribution_transportation',
  'Currently embedded as the AI/ML integration and multi-tenant platform engineering team for an enterprise platform with complex external integrations',
  'AI/ML integration + multi-tenant platform engineering', true),
('Cayuse Technologies', 'Enterprise services / BPO', 'other',
  'Delivered AI-assisted developer productivity engagement accelerating software modernization through Claude Code adoption',
  'AI-assisted developer productivity / software modernization via Claude Code', true),
('Park Lawn', 'Distributed services (deathcare)', 'other',
  'Multi-location physical-service operator engaged for workflow agents at the digital-physical seam',
  'Workflow agents at the digital-physical seam', false)
on conflict do nothing;

-- updated_at triggers
drop trigger if exists echelix_offerings_set_updated_at on public.echelix_offerings;
create trigger echelix_offerings_set_updated_at  before update on public.echelix_offerings  for each row execute function public.tg_set_updated_at();
drop trigger if exists echelix_references_set_updated_at on public.echelix_references;
create trigger echelix_references_set_updated_at  before update on public.echelix_references  for each row execute function public.tg_set_updated_at();

alter table public.echelix_offerings enable row level security;
alter table public.echelix_references enable row level security;
