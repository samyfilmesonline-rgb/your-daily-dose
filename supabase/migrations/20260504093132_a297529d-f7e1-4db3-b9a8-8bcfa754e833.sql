-- 1) Add optional badge label
ALTER TABLE public.credit_packs ADD COLUMN IF NOT EXISTS badge_label text;

-- 2) Reset packs
DELETE FROM public.credit_packs;

INSERT INTO public.credit_packs (id, name, credits, price_cents, is_popular, is_active, display_order, badge_label) VALUES
  ('credits_100',  '100 Créditos',   100,  1500,  false, true, 1, NULL),
  ('credits_200',  '200 Créditos',   200,  2500,  false, true, 2, NULL),
  ('credits_300',  '300 Créditos',   300,  3500,  false, true, 3, NULL),
  ('credits_500',  '500 Créditos',   500,  5500,  true,  true, 4, 'Mais popular'),
  ('credits_1000', '1.000 Créditos', 1000, 8500,  false, true, 5, NULL),
  ('credits_2000', '2.000 Créditos', 2000, 15500, false, true, 6, NULL),
  ('credits_3000', '3.000 Créditos', 3000, 21500, false, true, 7, NULL),
  ('credits_5000', '5.000 Créditos', 5000, 30000, false, true, 8, 'Melhor custo');
