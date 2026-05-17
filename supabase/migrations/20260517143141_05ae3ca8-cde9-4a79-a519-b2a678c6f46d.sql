
UPDATE public.farm_bots
   SET status='busy',
       current_order_id='09101730-cc69-43b6-a9ab-34c9f4cd3158',
       last_heartbeat_at=now(),
       updated_at=now()
 WHERE id='acc4d4c2-0678-482d-b288-c2b6641b3491';

UPDATE public.partner_credit_orders
   SET status='processing',
       assigned_at=COALESCE(assigned_at, now()),
       failed_reason=NULL,
       updated_at=now()
 WHERE id='09101730-cc69-43b6-a9ab-34c9f4cd3158' AND status='paid';
