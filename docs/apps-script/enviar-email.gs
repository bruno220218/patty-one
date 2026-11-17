/**
 * Patty One - e-mail das liberações aprovadas + envio de anexos para o Google Drive.
 *
 * Roda na conta Google da empresa (atendimento@pattynet.com.br).
 * Como instalar/atualizar: veja docs/apps-script/README.md.
 *
 * SEGREDO: o mesmo valor de APPS_SCRIPT_SECRET na Cloudflare.
 */
const SEGREDO = 'TROQUE-ESTE-SEGREDO';

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.acao === 'upload') return resposta(upload(body));
    return resposta(email(body));
  } catch (err) {
    return resposta({ ok: false, error: String((err && err.message) || err) });
  }
}

/** E-mail da liberação aprovada (chamado pelo servidor do app). */
function email(body) {
  if (body.secret !== SEGREDO) return { ok: false, error: 'não autorizado' };
  const to = (body.to || []).filter(function (x) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x); });
  if (!to.length) return { ok: false, error: 'nenhum destinatário' };

  const opcoes = { htmlBody: body.html, name: 'Patty One', bcc: to.join(',') };
  if (body.attachment && body.attachment.base64) {
    opcoes.attachments = [
      Utilities.newBlob(
        Utilities.base64Decode(body.attachment.base64),
        'application/pdf',
        body.attachment.name || 'liberacao.pdf'
      ),
    ];
  }
  // Um e-mail só, com todos em cópia oculta (ninguém vê o e-mail dos outros).
  GmailApp.sendEmail(Session.getEffectiveUser().getEmail(), body.subject,
    'Abra este e-mail em um leitor com HTML.', opcoes);
  return { ok: true, enviados: to.length };
}

/** Arquivo enviado direto do navegador, com um "ticket" assinado pelo servidor do app. */
function upload(body) {
  const esperado = Utilities.base64Encode(
    Utilities.computeHmacSha256Signature(body.payload, SEGREDO, Utilities.Charset.UTF_8));
  if (body.assinatura !== esperado) return { ok: false, error: 'não autorizado' };

  const t = JSON.parse(body.payload);
  if (!t.exp || t.exp < Date.now()) return { ok: false, error: 'autorização expirada, tente de novo' };

  let pasta = DriveApp.getRootFolder();
  (t.pasta || []).forEach(function (nome) { pasta = subpasta(pasta, nome); });

  const blob = Utilities.newBlob(Utilities.base64Decode(body.base64), t.mime, t.nome);
  const arquivo = pasta.createFile(blob);
  if (t.autor) arquivo.setDescription('Enviado pelo Patty One por ' + t.autor);
  try {
    // Quem é da empresa abre com o link.
    arquivo.setSharing(DriveApp.Access.DOMAIN_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (err) {
    // Se a empresa não permitir, o arquivo fica só com a conta atendimento@.
  }
  return { ok: true, id: arquivo.getId(), url: arquivo.getUrl() };
}

function subpasta(pai, nome) {
  const it = pai.getFoldersByName(nome);
  return it.hasNext() ? it.next() : pai.createFolder(nome);
}

/** Rode esta função uma vez no editor para autorizar o Gmail e o Drive. */
function testar() {
  const pasta = subpasta(DriveApp.getRootFolder(), 'Patty One');
  GmailApp.sendEmail(Session.getEffectiveUser().getEmail(), 'Teste Patty One',
    'Funcionou! Pasta do Drive: ' + pasta.getUrl());
}

function resposta(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
