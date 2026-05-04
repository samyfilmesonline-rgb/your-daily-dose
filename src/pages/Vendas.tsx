import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  ShieldCheck,
  Zap,
  Star,
  Wallet,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import MatrixRain from "@/components/landing/MatrixRain";
import GlitchText from "@/components/landing/GlitchText";
import Marquee from "@/components/landing/Marquee";
import PricingCard from "@/components/landing/PricingCard";
import CheckoutPixDialog from "@/components/landing/CheckoutPixDialog";
import { CreditPack } from "@/lib/credit-packs";

// Theme override Matrix-green aplicado apenas nesta página.
const matrixThemeStyle = `
  .matrix-theme {
    --background: 120 10% 2%;
    --foreground: 120 80% 90%;
    --card: 120 10% 5%;
    --card-foreground: 120 80% 90%;
    --popover: 120 10% 6%;
    --popover-foreground: 120 80% 90%;
    --primary: 120 100% 45%;
    --primary-foreground: 120 10% 4%;
    --secondary: 120 50% 20%;
    --secondary-foreground: 120 80% 90%;
    --muted: 120 10% 15%;
    --muted-foreground: 120 20% 65%;
    --accent: 120 80% 35%;
    --accent-foreground: 120 10% 4%;
    --border: 120 30% 18%;
    --input: 120 10% 12%;
    --ring: 120 100% 45%;
  }
`;

export default function Vendas() {
  const [selectedPack, setSelectedPack] = useState<CreditPack | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  useEffect(() => {
    document.title = "Compre créditos Lovable | Matrix Credits";
    const meta =
      document.querySelector('meta[name="description"]') ??
      Object.assign(document.createElement("meta"), { name: "description" });
    meta.setAttribute(
      "content",
      "Compre pacotes de créditos para a Lovable via Pix com liberação imediata. Sem assinatura mensal."
    );
    if (!meta.parentNode) document.head.appendChild(meta);
  }, []);

  const { data: packs, isLoading } = useQuery({
    queryKey: ["credit-packs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("credit_packs")
        .select("*")
        .eq("is_active", true)
        .order("display_order", { ascending: true });
      if (error) throw error;
      return data as CreditPack[];
    },
  });

  const reviews = useMemo(
    () => [
      { name: "Lucas M.", username: "@lucasm", body: "Comprei 1000 créditos, caiu na hora. Sensacional!" },
      { name: "Amanda S.", username: "@amandas", body: "Sem mensalidade chata, pago só quando preciso." },
      { name: "Ricardo P.", username: "@ricardop", body: "Pix entrou em segundos, licença liberada na hora." },
      { name: "Juliana R.", username: "@julianar", body: "Muito mais barato que comprar direto na Lovable." },
      { name: "Carlos E.", username: "@carlose", body: "Já estou na 3ª recarga, recomendo demais." },
      { name: "Fernanda L.", username: "@fernandal", body: "Suporte respondeu em 2 minutos no WhatsApp." },
    ],
    []
  );

  const faqs = [
    {
      q: "Como recebo meus créditos após o pagamento?",
      a: "Assim que o Pix é confirmado (geralmente em segundos), uma licença é criada automaticamente vinculada ao seu e-mail. Você acessa o painel com esse mesmo e-mail e já pode usar.",
    },
    {
      q: "Existe limite de quantos créditos posso usar por dia?",
      a: "Sim. A Lovable libera no máximo 200 créditos por conta a cada 24h. Você pode recarregar valores menores que 200 quando quiser, desde que não ultrapasse esse teto por conta no período de 24h.",
    },
    {
      q: "Posso usar o mesmo pacote em mais de uma conta Lovable?",
      a: "Sim. O limite de 200/dia é por conta, não por compra. Comprando pacotes maiores você garante o melhor custo por crédito e pode distribuir os créditos entre várias contas próprias ou até revender para outras pessoas.",
    },
    {
      q: "Os créditos têm validade?",
      a: "Não. Os créditos comprados ficam disponíveis na sua conta até serem consumidos.",
    },
    {
      q: "É seguro? Vocês têm acesso à minha conta Lovable?",
      a: "Sim, é 100% seguro. Não pedimos sua senha da Lovable. Os créditos são alocados internamente no nosso sistema.",
    },
    {
      q: "Posso trocar de pacote depois?",
      a: "Pode. Cada compra é independente. Você pode comprar quantos pacotes quiser, quando quiser.",
    },
    {
      q: "Vocês oferecem garantia?",
      a: "Sim, garantia de 7 dias. Se não funcionar como prometido, devolvemos 100% do valor.",
    },
  ];

  const scrollToPricing = () => {
    document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" });
  };

  const handleBuy = (pack: CreditPack) => {
    setSelectedPack(pack);
    setCheckoutOpen(true);
  };

  return (
    <div className="matrix-theme min-h-screen bg-background text-foreground relative overflow-x-hidden">
      <style>{matrixThemeStyle}</style>
      <MatrixRain />

      {/* Overlay escurecedor */}
      <div className="fixed inset-0 z-[1] bg-background/80 pointer-events-none" />
      {/* Glow orbs */}
      <div className="fixed top-0 left-0 w-full h-[40vh] bg-gradient-to-b from-primary/15 to-transparent z-[2] pointer-events-none" />
      <div className="fixed bottom-0 left-0 w-full h-[30vh] bg-gradient-to-t from-primary/10 to-transparent z-[2] pointer-events-none" />

      {/* Top bar */}
      <header className="relative z-10 flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-md bg-primary text-primary-foreground grid place-items-center font-black">
            M
          </div>
          <span className="font-mono font-bold uppercase tracking-wider text-sm">
            Matrix Credits
          </span>
        </div>
        <Link to="/auth">
          <Button variant="ghost" className="text-muted-foreground hover:text-primary">
            Entrar
          </Button>
        </Link>
      </header>

      {/* HERO */}
      <section className="relative z-10 pt-10 pb-16 px-4">
        <div className="container mx-auto max-w-4xl text-center">
          <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/40 rounded-full px-4 py-2 mb-6">
            <Star className="w-4 h-4 text-primary" />
            <span className="text-sm text-primary font-medium">
              Créditos Lovable sem assinatura
            </span>
          </div>
          <h1 className="text-5xl sm:text-6xl md:text-7xl font-black tracking-tight font-mono mb-4">
            <GlitchText>MATRIX CREDITS</GlitchText>
          </h1>
          <h2 className="text-xl sm:text-2xl md:text-3xl text-foreground mb-8 max-w-3xl mx-auto font-bold leading-relaxed">
            Compre créditos para a Lovable e construa{" "}
            <span className="text-primary">sem limite</span>.
          </h2>
          <p className="text-muted-foreground mb-8 max-w-2xl mx-auto">
            Pague uma vez, use quando quiser. Sem mensalidades, sem surpresas. Pix com
            liberação automática.
          </p>
          <Button size="lg" onClick={scrollToPricing} className="font-bold uppercase tracking-wider">
            Quero meus créditos <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
        </div>
      </section>

      {/* COMO FUNCIONA */}
      <section className="relative z-10 py-16 px-4">
        <div className="container mx-auto max-w-5xl">
          <h3 className="text-3xl sm:text-4xl font-bold text-center mb-12">
            <GlitchText>COMO FUNCIONA</GlitchText>
          </h3>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { icon: Wallet, title: "1. Escolha seu pacote", desc: "Selecione a quantidade de créditos que combina com o seu projeto." },
              { icon: Zap, title: "2. Pague no Pix", desc: "Escaneie o QR Code ou copie o código. Confirmação em segundos." },
              { icon: CheckCircle2, title: "3. Use seus créditos", desc: "Sua licença é criada automaticamente, vinculada ao seu e-mail." },
            ].map((s) => (
              <div
                key={s.title}
                className="border border-primary/30 rounded-2xl p-6 bg-card/40 backdrop-blur"
              >
                <s.icon className="w-10 h-10 text-primary mb-4" />
                <h4 className="text-lg font-bold mb-2">{s.title}</h4>
                <p className="text-sm text-muted-foreground">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* DEPOIMENTOS */}
      <section className="relative z-10 py-16">
        <div className="text-center mb-10 px-4">
          <h3 className="text-3xl sm:text-4xl font-bold">
            <GlitchText>QUEM JÁ COMPROU APROVA</GlitchText>
          </h3>
        </div>
        <Marquee className="px-4">
          {reviews.map((r) => (
            <figure
              key={r.username}
              className="w-72 border border-primary/30 bg-card/60 rounded-2xl p-4 backdrop-blur"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-primary/20 border border-primary/40 grid place-items-center font-bold text-primary">
                  {r.name[0]}
                </div>
                <div>
                  <div className="font-semibold text-sm">{r.name}</div>
                  <div className="text-xs text-primary">{r.username}</div>
                </div>
              </div>
              <blockquote className="text-sm text-muted-foreground leading-relaxed">
                "{r.body}"
              </blockquote>
            </figure>
          ))}
        </Marquee>
      </section>

      {/* PRICING */}
      <section id="pricing" className="relative z-10 py-16 px-4">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-12">
            <h3 className="text-3xl sm:text-4xl font-bold mb-4">
              <GlitchText>ESCOLHA SEU PACOTE</GlitchText>
            </h3>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Quanto maior o pacote, menor o custo por crédito. Use em várias contas
              Lovable — o limite de <strong className="text-primary">200 créditos a cada 24h é por conta</strong>,
              não por compra.
            </p>
          </div>
          {isLoading ? (
            <div className="text-center text-muted-foreground py-10">Carregando...</div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {packs?.map((p) => (
                <PricingCard key={p.id} pack={p} onBuy={handleBuy} />
              ))}
            </div>
          )}
          <div className="flex items-center justify-center gap-2 mt-10 text-sm text-muted-foreground">
            <ShieldCheck className="w-4 h-4 text-primary" />
            Pagamento seguro via Pix · Garantia de 7 dias
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="relative z-10 py-16 px-4">
        <div className="container mx-auto max-w-3xl">
          <h3 className="text-3xl sm:text-4xl font-bold text-center mb-10">
            <GlitchText>PERGUNTAS FREQUENTES</GlitchText>
          </h3>
          <Accordion type="single" collapsible className="space-y-2">
            {faqs.map((f, i) => (
              <AccordionItem
                key={i}
                value={`item-${i}`}
                className="border border-primary/30 rounded-xl px-4 bg-card/40 backdrop-blur"
              >
                <AccordionTrigger className="text-left font-semibold">
                  {f.q}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  {f.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="relative z-10 border-t border-primary/20 py-8 px-4 mt-10">
        <div className="container mx-auto max-w-6xl flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <span>© {new Date().getFullYear()} Matrix Credits. Todos os direitos reservados.</span>
          <div className="flex items-center gap-4">
            <Link to="/auth" className="hover:text-primary">Entrar</Link>
            <a href="#pricing" className="hover:text-primary">Planos</a>
          </div>
        </div>
      </footer>

      <CheckoutPixDialog
        pack={selectedPack}
        open={checkoutOpen}
        onOpenChange={setCheckoutOpen}
      />
    </div>
  );
}