# Patty One

Crie um aplicativo web responsivo chamado Trilha para organizar checklists e gerenciar projetos. Visual limpo de SaaS, tema claro e escuro, em português do Brasil.

Menu lateral no desktop (barra inferior no celular) com três áreas: Checklists, Projetos e Arquivados.

Nesta etapa, implemente só a área Checklists: criar, editar, duplicar e excluir (com confirmação) checklists com nome (obrigatório), descrição e tarefas. Dentro de um checklist, o usuário adiciona, edita, exclui e reordena tarefas (botões subir/descer). Cada card mostra a quantidade de tarefas. Trate o estado vazio.

Salve os dados no localStorage, por uma camada de acesso a dados separada da interface, para eu poder trocar por banco de dados depois. Todo registro tem ID único. Não use dados fictícios.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://servicospatty.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/482ad6da-6269-483e-8f24-ab8b47fdabdf).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
