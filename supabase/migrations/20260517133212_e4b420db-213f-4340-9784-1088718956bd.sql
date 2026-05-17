-- Add waiting_invite and waiting_workspace to partner_order_status enum
ALTER TYPE public.partner_order_status ADD VALUE IF NOT EXISTS 'waiting_invite';
ALTER TYPE public.partner_order_status ADD VALUE IF NOT EXISTS 'waiting_workspace';