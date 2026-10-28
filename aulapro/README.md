# AulaPro All-in-1 — Software para professores moçambicanos

Aplicação **desktop instalável** (não é site): Electron + SQLite local. Funciona 100% offline; sincroniza quando há internet.
Implementa os 9 módulos do *Documento Mestre V2.0* (documento principal) e as interfaces do PDF de design.

## Módulos
1. **Caderneta Mestra** — ACS1-3 + AT por trimestre, Regra A (padrão Sofala) / Regra B, média anual, exame (opção 1/2), cores (≥10 verde, 8–9,9 amarelo, <8 vermelho), pesquisa, validação 0–20, importação CSV, export PDF/CSV com timbre, simulador de exame (Premium).
2. **Plano de Aula Gerador** — texto, PDF (parser, até 25 MB), foto (OCR Tesseract, até 10 MB), TXT/DOCX, instrução “Como devo organizar?”, modelos da escola, 500 planos locais, edição, export PDF.
3. **Apresentação 1-Clique** — 3 a 10 slides a partir do plano, edição, modo “Apresentar”, export PPTX/PDF.
4. **Fichas e Testes** — múltipla escolha A–D, V/F, problemas; pontos; gabarito; auto-save 2 s; export PDF e DOCX; banco de questões (Premium).
5. **Biblioteca** — PDFs de licença aberta/domínio público; filtros; “Ler”; “Resumir para o plano”; fica disponível nos módulos 2 e 4; fontes abertas (BNM, OpenStax, UNESCO, Khan Academy).
6. **Assistente de Voz** — comando falado → plano (limites Grátis: 5 usos/mês, 1 min).
7. **Dashboard do Director** (plano Escola) — aprovação, média, desempenho por turma, alunos em risco, relatórios PDF/CSV.
8. **Central Offline** — estado de sincronização, armazenamento, backup local, exportar tudo, sincronização com servidor.
9. **Painel do Desenvolvedor** — login com palavra-passe mestra + **2FA (TOTP)**, KPIs, utilizadores, **fila de pagamentos com regra automática das 2 h**, números de pagamento, reclamações, chat, actualizações, logs (CSV).

Planos (Documento Mestre): Grátis · Semanal 99 MT · Mensal 299 MT · Anual 2.999 MT · Escola 5.000 MT/mês (até 30 professores). Marca de água grátis: “Gerado com AulaPro Grátis - aula.pro”.

## Gerar o instalador
Requisitos: Node.js 20+ e acesso ao npm.
```bash
npm install
# opcional, para OCR offline: coloque src/ocr/por.traineddata (ver src/ocr/LEIA-ME.txt)
npm start            # abre a aplicação para testar
npm test             # fórmulas, limites, segurança, pagamentos, admin
npm run dist:win     # Windows  -> instalador + versão portátil
npm run dist:mac     # macOS    -> .dmg (compilar num Mac)
npm run dist:linux   # Linux    -> .AppImage e .deb (instalável no Chromebook pela app Ficheiros)
```
Para compilar no GitHub, execute **Empacotar e publicar AulaPro** em Actions; os ficheiros ficam disponíveis como artefactos por 14 dias. O fluxo gera instaladores desktop, APK Android e um ZIP PWA para alojamento. Ao enviar uma etiqueta igual à versão deste `package.json` (por exemplo, `v1.0.0`), os ficheiros serão publicados numa página Releases. Releases e a PWA só serão públicos se o repositório/site também estiverem públicos.

### Chromebook como app instalada (PWA)
A versão PWA abre e instala pelo Chrome, sem Linux nem modo de programador do ChromeOS, como uma aplicação web instalada. Requer publicar o site numa origem HTTPS. Active **GitHub Pages** nas definições do repositório (Settings → Pages → Source: GitHub Actions) e envie as alterações para `main`; o workflow **Publicar AulaPro para instalação no Chromebook** publicará o site. Depois, abra o endereço Pages do repositório no Chrome do Chromebook e escolha **Instalar AulaPro** no botão da aplicação ou no menu do Chrome. Também pode descarregar `AulaPro-PWA.zip` numa Release e alojar o conteúdo num servidor HTTPS. Depois da primeira abertura, a interface e os dados locais continuam disponíveis offline. Funções que dependem de internet continuam a precisar de ligação.

### Chromebook
Recomendado: instale a PWA pelo Chrome, como acima. Alternativamente, active **Ambiente de desenvolvimento Linux**, descarregue o `.deb` Linux da arquitectura do Chromebook (`amd64` para x86-64 ou `arm64` para ARM) e abra-o pela app **Ficheiros** com **Instalar com Linux**, se a versão do ChromeOS oferecer essa opção. A alternativa `.deb` requer Linux; a PWA não. Nenhuma delas exige activar o modo de programador do ChromeOS.

## Versão Android (APK)
A mesma interface e os mesmos módulos corrêm no telemóvel (Capacitor + SQLite em WebAssembly, offline).
* No GitHub: **Actions → Empacotar e publicar AulaPro → Run workflow**. No fim, descarregue o artefacto `AulaPro-Android-APK` e abra `AulaPro-Android-debug.apk` no telemóvel Android. Permita a instalação desta fonte quando solicitado. O APK de teste é assinado pela chave de depuração temporária do GitHub Actions; para receber actualizações sem reinstalar, é necessária uma chave de assinatura Android permanente.
* Localmente: `npm install`, `npm run mobile:build`, `npx cap add android`, `npx cap sync android`, e compile com Android Studio.
* Nesta primeira versão: PDF e foto (OCR) como material do Plano de Aula só no computador (no telemóvel use texto, TXT ou DOCX); o painel do desenvolvedor só no computador; as exportações abrem a janela “Partilhar/Guardar”.
* Os dados do telemóvel e do computador **não se sincronizam** até existir um servidor (ver abaixo).
* O APK é para Android. iPhone/iPad requerem uma compilação iOS assinada e distribuição pela Apple.

## Primeira utilização
* Professores/directores criam conta no ecrã inicial (palavra-passe ≥ 6 caracteres e 1 símbolo; bloqueio de 15 min após 5 tentativas; sessão expira após 30 min de inactividade).
* **Desenvolvedor:** ecrã inicial → “Acesso do desenvolvedor” → criar administrador (mostra o segredo 2FA uma só vez; adicione ao Google Authenticator).
* Em **Números de pagamento** defina M-Pesa, E-Mola e o nome de confirmação (ex.: `AULAPRO-PAYMENTS-OFFICIAL`). Os utilizadores vêem os novos dados de imediato.
* IA: em **Números de pagamento → Sincronização e IA** pode ligar uma API compatível com OpenAI. Sem ela, o AulaPro usa o motor local (offline).

## Limitações conhecidas
* **Sem servidor central:** cada instalação (computador ou telemóvel) é independente. Os pagamentos enviados por um utilizador só chegam ao Painel do Desenvolvedor da *mesma* instalação; para o fluxo real (utilizador paga → desenvolvedor verifica noutro aparelho → Premium libertado) é preciso um servidor com contas, pagamentos e sincronização. É o passo seguinte recomendado.
* **Telemóveis:** a app Android é distribuída como APK; iOS exige assinatura e distribuição próprias da Apple.
* **Voz:** usa o reconhecimento de voz do motor Chromium; pode exigir internet. Sem suporte, escreve-se o comando.
* **Pagamentos:** a verificação é por comprovativo + regras; não há ligação à API da M-Pesa/E-Mola.
* **Sincronização / actualizações automáticas:** requerem um servidor (`sync_url` e `build.publish.url` em `package.json`).
* Recuperação de palavra-passe: sem servidor de email, o código aparece no ecrã.
