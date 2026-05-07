## Mudança

Em `src/pages/ComprarParceiro.tsx` (seção "Requisitos importantes", linhas ~635–670):

1. **Remover** o card "Não pode ter · Assinatura PRO ativa" (linhas 644–655).
2. **Remover** o aviso vermelho de rodapé "ATENÇÃO: pedidos feitos com a conta fora dessas regras..." (linhas 667–669), pois fala em "regras" no plural e perde sentido.
3. **Ajustar o texto introdutório** para falar de uma única regra (ex.: "confirme que sua conta atende a esta regra").
4. **Trocar o grid** `md:grid-cols-2` por layout de coluna única, mantendo apenas o card "Limite por workspace" centralizado.

Sem mudanças em backend, banco ou outros arquivos.