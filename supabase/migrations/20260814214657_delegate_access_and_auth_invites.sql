-- AGI platform Auth: introduce the delegate identity class in its own
-- transaction. PostgreSQL enum additions cannot be used safely by later DDL
-- until the transaction that adds the value commits.

alter type public.app_role add value if not exists 'infrastructure_delegate';

-- Provenance: Notion Sprint 001 Hub + Loop 805 Slice AGI-AUTH-DELEGATES + Hash: 8e2d66e30c2a77967a3c0aa064c24422eedfac59
