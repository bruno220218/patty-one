/**
 * Patty One - envio de e-mails das liberações aprovadas.
 *
 * Roda na conta Google da empresa (@pattynet.com.br) e envia pelo Gmail dela.
 * Como instalar: veja docs/apps-script/README.md.
 *
 * Troque o valor abaixo por um segredo longo (o mesmo que vai em APPS_SCRIPT_SECRET na Cloudflare).
 */
const SEGREDO = 'TROQUE-ESTE-SEGREDO';

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.secret !== SEGREDO) return resposta({ ok: false, error: 'não autorizado' });

    const to = (body.to || []).filter(function (x) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x); });
    if (!to.length) return resposta({ ok: false, error: 'nenhum destinatário' });

    const opcoes = { htmlBody: body.html, name: 'Patty One' };
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
      'Abra este e-mail em um leitor com HTML.', Object.assign(opcoes, { bcc: to.join(',') }));
    return resposta({ ok: true, enviados: to.length });
  } catch (err) {
    return resposta({ ok: false, error: String(err && err.message || err) });
  }
}

/** Rode esta função uma vez no editor para autorizar o Gmail. */
function testar() {
  GmailApp.sendEmail(Session.getEffectiveUser().getEmail(), 'Teste Patty One', 'Funcionou!');
}

function resposta(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
