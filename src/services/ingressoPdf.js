const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');

// Ingresso em PDF, para baixar e guardar no celular (ou imprimir). Um ingresso por página, em
// nome do titular, com QR code válido: o QR carrega o próprio `codigo_qr`, que a portaria valida
// no check-in (o código é aleatório e único, então não dá para adivinhar nem falsificar).

const COR_ESCURA = '#16151A';
const COR_DESTAQUE = '#F7C531';
const COR_SUAVE = '#64636B';

function mascarar(documento) {
  if (!documento) return '';
  const d = String(documento);
  if (/^\d{11}$/.test(d)) return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`; // CPF: mostra só o miolo
  return `${d.slice(0, 2)}${'*'.repeat(Math.max(d.length - 4, 1))}${d.slice(-2)}`;
}

const data = (d) => (d ? new Date(d).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '');
const dataHora = (d) => (d ? new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'long', timeStyle: 'short' }) : '');
const moeda = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function idadeEm(nascimento) {
  if (!nascimento) return null;
  const n = new Date(nascimento); const h = new Date();
  let i = h.getUTCFullYear() - n.getUTCFullYear();
  if (h.getUTCMonth() < n.getUTCMonth() || (h.getUTCMonth() === n.getUTCMonth() && h.getUTCDate() < n.getUTCDate())) i -= 1;
  return i;
}

async function desenharIngresso(doc, i) {
  const largura = doc.page.width;
  const margem = 44;

  // Faixa superior
  doc.rect(0, 0, largura, 150).fill(COR_ESCURA);
  doc.fillColor(COR_DESTAQUE).font('Helvetica-Bold').fontSize(11).text('CCPOP  ·  GEEKTOPIA', margem, 34, { characterSpacing: 2 });
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(24).text(i.geektopia.nome_edicao, margem, 56, { width: largura - margem * 2 });
  const linhaTopo = [dataHora(i.geektopia.data_inicio), i.geektopia.local].filter(Boolean).join('   |   ');
  if (linhaTopo) doc.fillColor('#D5D4DC').font('Helvetica').fontSize(11).text(linhaTopo, margem, 112, { width: largura - margem * 2 });
  doc.rect(0, 150, largura, 5).fill(COR_DESTAQUE);

  // Titular
  const topo = 190;
  const colunaEsq = largura - margem * 2 - 250;
  doc.fillColor(COR_SUAVE).font('Helvetica').fontSize(9).text('TITULAR', margem, topo, { characterSpacing: 1.5 });
  doc.fillColor(COR_ESCURA).font('Helvetica-Bold').fontSize(20).text(i.nome_titular, margem, topo + 14, { width: colunaEsq });
  const yInfo = doc.y + 10;
  doc.fillColor(COR_SUAVE).font('Helvetica').fontSize(11);
  doc.text(`Documento: ${mascarar(i.documento_titular)}`, margem, yInfo, { width: colunaEsq });
  if (i.data_nascimento_titular) doc.text(`Nascimento: ${data(i.data_nascimento_titular)}`, { width: colunaEsq });

  doc.moveDown(1);
  doc.fillColor(COR_SUAVE).fontSize(9).text('INGRESSO', { characterSpacing: 1.5, width: colunaEsq });
  doc.fillColor(COR_ESCURA).font('Helvetica-Bold').fontSize(14).text(`${i.lote.nome_lote}`, { width: colunaEsq });
  doc.font('Helvetica').fontSize(11).fillColor(COR_SUAVE).text(`${moeda(i.lote.valor_ingresso)}   |   Ingresso nº ${i.id_ingresso}`, { width: colunaEsq });
  if (i.idade_minima) doc.text(`Classificação: ${i.idade_minima}+ anos`, { width: colunaEsq });

  // QR code (direita)
  const tamQr = 210;
  const xQr = largura - margem - tamQr;
  const png = await QRCode.toBuffer(i.codigo_qr, { errorCorrectionLevel: 'M', margin: 1, width: 420 });
  doc.roundedRect(xQr - 12, topo - 6, tamQr + 24, tamQr + 64, 10).lineWidth(1.5).stroke(COR_ESCURA);
  doc.image(png, xQr, topo + 6, { width: tamQr, height: tamQr });
  doc.fillColor(COR_SUAVE).font('Courier').fontSize(7.5).text(i.codigo_qr, xQr - 8, topo + tamQr + 16, { width: tamQr + 16, align: 'center' });
  doc.fillColor(COR_ESCURA).font('Helvetica-Bold').fontSize(9).text('Apresente na entrada', xQr - 8, topo + tamQr + 38, { width: tamQr + 16, align: 'center' });

  // Situação (marca d'água)
  if (i.status_ingresso !== 'Valido') {
    doc.save();
    doc.rotate(-20, { origin: [largura / 2, 420] });
    doc.fillColor(i.status_ingresso === 'Cancelado' ? '#E4405F' : '#64636B').opacity(0.28).font('Helvetica-Bold').fontSize(64)
      .text(i.status_ingresso === 'Cancelado' ? 'CANCELADO' : 'UTILIZADO', 60, 380, { width: largura - 120, align: 'center' });
    doc.restore();
    doc.opacity(1);
  }

  // Orientações
  let y = Math.max(doc.y, topo + tamQr + 90) + 24;
  doc.moveTo(margem, y).lineTo(largura - margem, y).lineWidth(0.8).strokeColor('#CDC8BD').stroke();
  y += 16;
  doc.fillColor(COR_ESCURA).font('Helvetica-Bold').fontSize(12).text('Antes de ir', margem, y);
  doc.font('Helvetica').fontSize(10).fillColor(COR_ESCURA);

  const avisos = [
    'Leve um documento oficial com foto. Ele será conferido com o nome do titular na entrada.',
    i.geektopia.aviso_documentacao,
    i.geektopia.regras_idade_minima,
    i.lote.categoria === 'Meia' && 'Meia-entrada: leve a comprovação do direito (carteirinha ou documento válido). Sem ela, é cobrada a diferença.'
  ];
  const idade = idadeEm(i.data_nascimento_titular);
  if (idade !== null && idade < 18) {
    avisos.push('Titular menor de 18 anos: até 11 anos, entrada somente com um responsável; de 12 a 17 anos, sem responsável é preciso apresentar o termo de autorização assinado.');
  }
  avisos.filter(Boolean).forEach((t) => doc.text(`•  ${t}`, margem, doc.y + 4, { width: largura - margem * 2 }));

  const proibidos = String(i.geektopia.objetos_proibidos || '').split('\n').map((l) => l.trim()).filter(Boolean);
  if (proibidos.length) {
    doc.moveDown(0.8).font('Helvetica-Bold').fontSize(12).text('Não é permitido levar', margem, doc.y);
    doc.font('Helvetica').fontSize(10);
    proibidos.forEach((t) => doc.text(`•  ${t}`, margem, doc.y + 3, { width: largura - margem * 2 }));
  }

  doc.fillColor(COR_SUAVE).fontSize(8).text('Este ingresso é pessoal e tem QR code único, válido para uma única entrada. Não compartilhe a imagem do QR code.', margem, doc.page.height - 60, { width: largura - margem * 2, align: 'center' });
}

// Escreve no `saida` (a resposta HTTP) um PDF com um ingresso por página.
async function gerarPdfIngressos(ingressos, saida) {
  const doc = new PDFDocument({ size: 'A4', margin: 0, info: { Title: 'Ingresso Geektopia', Author: 'CCPOP' } });
  doc.pipe(saida);
  for (let n = 0; n < ingressos.length; n += 1) {
    if (n > 0) doc.addPage();
    // eslint-disable-next-line no-await-in-loop
    await desenharIngresso(doc, ingressos[n]);
  }
  doc.end();
}

module.exports = { gerarPdfIngressos, mascarar };
