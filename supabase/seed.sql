-- Safe operational seeds only. No constituent records or personal data.

insert into public.decisions (key, title, status, rationale, evidence)
values
  ('campaign-420k-case','Approve the $420K campaign case','open',null,'{"required":["use_of_funds","net_need","campaign_budget"]}'::jsonb),
  ('campaign-2m-case','Approve or defer the $2M transformation case','open',null,'{"required":["capital_plan","delivery_owners","milestones","demand_evidence"]}'::jsonb),
  ('sponsor-benefits','Approve sponsor benefits and exclusions','open',null,'{"required":["costed_inventory","fulfillment_owners","tax_review","governance_exclusions"]}'::jsonb),
  ('privacy-outreach','Approve privacy, consent, suppression, and outreach policy','open',null,'{"required":["lawful_basis","suppression","retention","audit","relationship_ownership"]}'::jsonb),
  ('donation-reconciliation','Approve Every.org reconciliation workflow','open',null,'{"required":["export_format","cash_vs_pledge","refunds","restricted_funds","receipt_owner"]}'::jsonb)
on conflict (key) do nothing;
