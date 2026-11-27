# Pauta — guia de instalação

Um único código gera o **APK para Android** e a **versão web para PC**. As duas se comunicam pelo Firebase.

## 1. Firebase (sincronização)
1. Acesse console.firebase.google.com e crie um projeto (o Google Analytics não é necessário).
2. **Authentication** > Começar > ative **E-mail/senha**.
3. **Firestore Database** > Criar banco de dados > modo de produção.
4. Na aba **Regras** do Firestore, apague o conteúdo, cole o do arquivo `firestore.rules` e clique em **Publicar**.
5. **Configurações do projeto** > Seus apps > ícone **Web** (`</>`) > registre o app. Copie os valores de `firebaseConfig`.
6. Cole os valores em `src/firebase-config.js`. Mantenha a palavra `export` no começo.

## 2. GitHub (gera o APK e publica o site)
1. Extraia o ZIP. Em github.com, crie um repositório chamado `pauta`, com a branch `main`.
   - O GitHub Pages gratuito exige repositório **público**: o código e o endereço do site ficam visíveis. Suas tarefas não ficam no repositório; elas são protegidas pelo login e pelas regras do passo 1.4.
2. Em **Settings > Pages > Source**, escolha **GitHub Actions**. Faça isso antes de enviar os arquivos.
3. Envie o **conteúdo** da pasta `pauta` (Add file > Upload files).
4. Confira se existe `.github/workflows/build.yml`. Pastas que começam com ponto podem ficar de fora. Se faltar, use **Add file > Create new file**, digite esse caminho como nome e cole o conteúdo do arquivo.
5. Abra a aba **Actions** > **Gerar APK e site** e aguarde. Se precisar, clique em **Run workflow**.
   - Se aparecer um erro vermelho, abra a etapa que falhou, copie a mensagem e me envie.

## 3. Instalar
- **Celular:** na execução concluída, em **Artifacts**, baixe `pauta-apk`, extraia o arquivo e abra o `app-debug.apk`. Autorize a instalação de fonte desconhecida.
- **PC:** abra `https://SEU-USUARIO.github.io/pauta/`. No Chrome ou no Edge, você também pode instalar a página como aplicativo.
- Clique em **Criar conta** uma vez e use **Entrar** com a mesma conta no outro aparelho.
- **Depois de criar a sua conta:** no Firebase, em Authentication > Settings > User actions, desative a criação de contas (*Enable create*). Assim ninguém mais se cadastra no seu projeto.

## Lembretes: como funcionam
- **Android:** em Ajustes, toque em **Permitir notificações**. O aviso é agendado no próprio celular.
- Um lembrete **criado ou alterado no PC só é atualizado no celular quando você abre o app com internet**. Enquanto isso, o celular pode avisar sobre uma tarefa já concluída ou alterada no PC. Não há notificação *push*.
- Nas configurações do Android, permita **Alarmes e lembretes** para o Pauta, se a opção aparecer. Sem isso, ou com economia de bateria, o aviso pode atrasar.
- **PC:** o aviso só aparece com a página aberta, e o navegador pode atrasá-lo em segundo plano.

## Atualizar o APK
Cada compilação usa uma assinatura de teste nova. Para atualizar, confirme que o app mostra **Sincronizado**, desinstale a versão antiga e instale a nova.

## Uso rápido
`Corrigir provas amanhã 14h p1 #Aulas @escola !30min`

- Datas: hoje, amanhã, na sexta, sexta-feira, 15/12, dia 5, em 3 dias
- Repetição: todo dia, dias úteis, toda sexta, todo dia 10, a cada 2 semanas
- Filtros: `p1 & 7 dias`, `atrasadas | hoje`, `#Aulas & !p4`
- No PC, a tecla **Q** abre uma nova tarefa. Arraste tarefas entre seções, no quadro ou no calendário.
- Concluir uma tarefa não conclui as subtarefas dela.
