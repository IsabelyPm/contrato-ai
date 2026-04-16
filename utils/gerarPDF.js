const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

// --- 1. FUNÇÕES AUXILIARES ---
function formatarDataCalendario(dataString) {
    if (!dataString) return "____-____-____";
    if (dataString.includes('-') && dataString.split('-')[0].length === 4) {
        const [ano, mes, dia] = dataString.split('-');
        return `${dia}-${mes}-${ano}`;
    }
    return dataString;
}

// --- 2. FUNÇÃO DE DESENHO (gerarPDF) ---
function gerarPDF(nomeArquivo, obj, userId) {
    const doc = new PDFDocument({ size: "A4", margins: { top: 60, bottom: 60, left: 70, right: 70 } });
 // Define o caminho: contratos/ID_DO_USUARIO
    const dirBase = path.join(__dirname, "..", "contratos");
    const dirUsuario = path.join(dirBase, String(userId));
    const filePath = path.join(dirUsuario, nomeArquivo);

    // Cria a pasta do usuário se não existir (o recursive: true garante a criação da 'contratos' também)
    if (!fs.existsSync(dirUsuario)) {
        fs.mkdirSync(dirUsuario, { recursive: true });
    }

    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    // Título
    doc.font("Times-Bold").fontSize(14).text(obj.titulo, { align: "center" });
    doc.moveDown(1.5);

    const criarQuadroDados = (tituloSecao, listaDados) => {
        doc.font("Times-Bold").fontSize(10).text(tituloSecao);
        
        // Adicionamos um recuo (indent) para o texto não encostar na linha lateral esquerda
        const recuoX = 75; 
        const yInicial = doc.y + 5; // Pequeno espaço após o título da seção

        doc.font("Times-Roman").fontSize(10);
        
        // Desenhamos o texto com o recuoX
        listaDados.forEach(linha => {
            doc.text(linha, recuoX, doc.y, { lineGap: 4 }); // Aumentei o lineGap para 4 para separar as linhas
        });

        const yFinal = doc.y;

        // Ajustamos o retângulo para envolver o texto com uma folga (padding)
        // doc.rect(x, y, largura, altura)
        doc.rect(65, yInicial - 8, 465, (yFinal - yInicial) + 15).stroke();
        
        doc.moveDown(2.5); // Espaço maior entre um quadro e outro
    };

    criarQuadroDados("DADOS DO CONTRATANTE:", obj.dadosContratante);
    criarQuadroDados("DADOS DO CONTRATADO:", obj.dadosContratado);

    // Texto Parte 1
    doc.font("Times-Roman").fontSize(11).text(obj.textoParte1, {
        align: "justify",
        lineGap: 3,
        paragraphGap: 10
    });

   // --- TABELA DE PAGAMENTOS ---
    if (obj.tabelaPagamentos && obj.tabelaPagamentos.length > 0) {
        doc.moveDown(1);
        const tableTop = doc.y;
        doc.font("Times-Bold").fontSize(10);
        
        // Forçamos as coordenadas X para garantir que a tabela não "empurre" o texto
        doc.text("DATA", 70, tableTop);
        doc.text("VALOR", 220, tableTop);
        doc.text("DESCRIÇÃO", 370, tableTop);
        
        doc.lineWidth(0.5).moveTo(70, tableTop + 12).lineTo(520, tableTop + 12).stroke();

        let rowY = tableTop + 20;
        doc.font("Times-Roman");
        obj.tabelaPagamentos.forEach(row => {
            if (rowY > 750) { doc.addPage(); rowY = 60; }
            doc.text(row[0], 70, rowY);
            doc.text(row[1], 220, rowY);
            doc.text(row[2], 370, rowY);
            rowY += 15;
        });
        
        // RESET CRÍTICO: Voltamos o cursor para a margem esquerda e para baixo da tabela
        doc.y = rowY + 15;
        doc.x = 70; 
    }

    // --- PARTE 2 DO TEXTO ---
    // Adicionamos explicitamente o align: "justify" e garantimos que ele use a largura total
    doc.font("Times-Roman").fontSize(11).text(obj.textoParte2, 70, doc.y, {
        align: "justify",
        lineGap: 3,
        paragraphGap: 10,
        width: 455 // Largura total da página (595) menos as margens (70+70)
    });

    // --- ASSINATURAS ---
    doc.moveDown(4);
    
    // Verifica se há espaço suficiente para as 4 assinaturas, senão cria nova página
    if (doc.y > 600) doc.addPage();
    
    const yAssinPartes = doc.y;
    
    // 1. Linhas para Contratante e Contratado
    doc.lineWidth(0.5);
    doc.moveTo(70, yAssinPartes).lineTo(250, yAssinPartes).stroke();
    doc.moveTo(320, yAssinPartes).lineTo(500, yAssinPartes).stroke();
    
    doc.font("Times-Bold").fontSize(9);
    doc.text(`CONTRATANTE:\n${obj.contratante}`, 70, yAssinPartes + 5, { width: 180 });
    doc.text(`CONTRATADO(A):\n${obj.contratado}`, 320, yAssinPartes + 5, { width: 180 });

    // 2. Linhas para as Testemunhas (Mais abaixo)
    doc.moveDown(5);
    const yAssinTestemunhas = doc.y;

    doc.moveTo(70, yAssinTestemunhas).lineTo(250, yAssinTestemunhas).stroke();
    doc.moveTo(320, yAssinTestemunhas).lineTo(500, yAssinTestemunhas).stroke();

    doc.text(`TESTEMUNHA 1:\nCPF:`, 70, yAssinTestemunhas + 5, { width: 180 });
    doc.text(`TESTEMUNHA 2:\nCPF:`, 320, yAssinTestemunhas + 5, { width: 180 });

    doc.end();
    return { filePath, stream };
}

// --- 3. LÓGICA DE NEGÓCIO ---
module.exports = function gerarContrato(d, userId) {
    const contratanteNome = d.tipoCliente === "pj" 
        ? String(d.razaoSocial || "CONTRATANTE").toUpperCase()
        : String(d.nome || "CONTRATANTE").toUpperCase();

    const contratadoNome = d.tipoPrestador === "pj"
        ? String(d.razaoSocialPrestador || "CONTRATADO").toUpperCase()
        : String(d.nomePrestador || "CONTRATADO").toUpperCase();

    const servico = (d.servico || "MARKETING DIGITAL").toUpperCase();
    const cidade = d.cidade || "Porto Ferreira";
    const dataContrato = d.inicio ? formatarDataCalendario(d.inicio) : "____/____/____";

    const valorLimpo = d.valor ? d.valor.replace(/[^\d,]/g, '').replace(',', '.') : "0";
    const valorTotal = parseFloat(valorLimpo) || 0;
    const numParcelas = parseInt(d.parcelas) || 1;
    const valorParcelaNum = valorTotal / numParcelas;
    const valorParcelaFormatado = valorParcelaNum.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    const formaPgto = (d.formaPagamento || 'PIX').toUpperCase();

    const tabelaPagamentos = [];
    if (d.formaPagamento === "pix") {
        tabelaPagamentos.push([`Dia ${d.dataPagamento || '___'}`, `R$ ${d.valor || '0,00'}`, "Integral (PIX)"]);
    } else {
        for (let i = 1; i <= numParcelas; i++) {
            tabelaPagamentos.push([`Dia ${d.dataPagamento || '___'}`, `R$ ${valorParcelaFormatado}`, `${i}ª Parcela`]);
        }
    }

    const montarDados = (tipo, prefixo) => {
        const isPJ = d[tipo] === "pj";
        const s = prefixo === "prestador" ? "Prestador" : "";
        const nomeFinal = isPJ ? (d['razaoSocial' + s] || '---') : (d['nome' + s] || '---');
        const docFinal = d['documento' + s] || '---';
        const rgFinal = d['rg' + s] || '---';
        const emailFinal = d['email' + s] || '---';
        const celularFinal = d['celular' + s] || '---';
        const logradouro = d['rua' + s] || '---';
        const numero = d['numero' + s] || '---';
        const bairro = d['bairro' + s] || '---';
        const cep = d['cep' + s] || '---';
        const estado = d['estadoPais' + s] || '---';

        return [
            `${isPJ ? 'Razão Social' : 'Nome'}: ${nomeFinal}`,
            `Data de Nasc./Fund.: ${formatarDataCalendario(d['nascimento' + s])}`,
            `${isPJ ? 'CNPJ' : 'CPF'}: ${docFinal}`,
            `RG/IE: ${rgFinal}`,
            `E-mail: ${emailFinal}`,
            `Celular: ${celularFinal}`,
            `Endereço: ${logradouro}, ${numero} - ${bairro}`,
            `Localidade: ${cep} - ${estado}`
        ];
    };

    const listaContratante = montarDados("tipoCliente", "cliente");
    const listaContratado = montarDados("tipoPrestador", "prestador");

    // --- DIVISÃO EXATA DO SEU TEXTO ---
    const textoParte1 = `As partes acima identificadas têm, entre si, justo e acertado o presente Contrato de Prestação de Serviços de Marketing Digital, considerando as disposições do Código Civil Brasileiro, que se regerá com fundamento nos artigos 421, 422, 425, 594 e 598 do Código Civil Brasileiro, bem como no princípio do "pacta sunt servanda" e na Lei 13.429/17 (Lei da Terceirização), pelas cláusulas, condições de preço, forma e termo de pagamento descritas no presente.

DO OBJETO DO CONTRATO
Cláusula 1ª. Constitui objeto do presente contrato a prestação de serviços de ${servico} e demais serviços inerentes na obtenção do êxito da publicização, sem exclusividade pelo profissional prestador, cujo atendimento será realizado na sede da contratante somente quando necessário e indispensável o seu comparecimento, podendo este prestá-lo em qualquer lugar contanto que atingida a finalidade deste contrato, podendo, inclusive, se dar como home office.

Parágrafo Único: Na prestação de serviço realizada na sede da empresa esta disponibilizará, quando necessário, aparelho celular, computador, espaço e demais ferramentas necessárias para a execução dos serviços.

DAS OBRIGAÇÕES DO (A) CONTRATADA (O)
CLÁUSULA 2ª. São deveres do (a) CONTRATADO (A):
a) Cumprir integralmente o disposto neste contrato;
b) Se obriga a utilizar técnicas condizentes com os serviços de ${servico}, efetuando todos os esforços para a sua consecução;
c) Fornecer à CONTRATANTE informações sobre as especificidades dos serviços necessários ao bom andamento das atividades desenvolvidas;
d) Prestar contas, quando julgar necessário, à CONTRATANTE sobre suas atividades realizadas;
e) Compromete-se a executar as atividades com zelo, cordialidade, simpatia e profissionalismo.
f) Comportar-se de forma respeitosa no convívio com demais profissionais, responsabilizando-se por seus auxiliares particulares;
g) Responsabilizar-se por acidentes na execução dos serviços e danos causados por culpa ou dolo.

DAS OBRIGAÇÕES DA CONTRATANTE
CLÁUSULA 3ª. São deveres da CONTRATANTE:
a) Realizar o pagamento conforme disposto na cláusula 4ª;
b) Zelar para que a CONTRATADA tenha todas as informações e acessos necessários;
c) Tratar o profissional com respeito e profissionalismo;
d) Arcar integralmente com investimentos em mídias (Google Ads, Facebook Ads, etc) e softwares de terceiros, quando necessário.

DOS HONORÁRIOS
CLÁUSULA 4ª. Pela execução dos serviços, a CONTRATADA receberá o valor total de R$ ${d.valor || '0,00'}, a ser pago via ${formaPgto}.
Parágrafo 1º: O pagamento se dará conforme a tabela abaixo, respeitando o dia ${d.dataPagamento || '___'} de cada mês:`.trim();

    const textoParte2 = `Parágrafo 2º: Correm por conta do (a) CONTRATADO (A) os encargos tributários e previdenciários sobre seus honorários.

DA DURAÇÃO DO CONTRATO
CLÁUSULA 5ª. O presente Contrato tem início em ${dataContrato} com duração de ${d.vigor || 'tempo indeterminado'}, prorrogáveis automaticamente por igual período.

DA PROPRIEDADE INTELECTUAL
Cláusula 6ª: Redes sociais, site, páginas e a marca são de propriedade da CONTRATANTE.
Cláusula 7ª: Materiais e bens imateriais publicados são protegidos pela legislação de direitos autorais.
Cláusula 8ª: A CONTRATANTE terá o direito de usar, por período indeterminado, todos os materiais criados durante a vigência deste contrato.

DO DIREITO DE IMAGEM
CLÁUSULA 9ª: O (A) CONTRATADO (A) autoriza expressamente a utilização de sua imagem e voz para fins de divulgação pela CONTRATANTE, a título gratuito.

DA PROTEÇÃO DE DADOS (LGPD)
CLÁUSULA 10ª: Em cumprimento à Lei 13.709/2018, as partes declaram-se cientes das obrigações e medidas de segurança no tratamento de dados pessoais.

DA RESCISÃO E RESILIÇÃO
Cláusula 11ª. A violação de cláusulas rescinde o contrato com multa de R$ 5.000,00 em benefício da parte inocente.
Cláusula 12ª. A resilição pode ocorrer a qualquer tempo com aviso prévio de 20 (vinte) dias, sem aplicação de multa.

DO SIGILO
Cláusula 13ª. As partes obrigam-se ao sigilo absoluto sobre estratégias e dados não públicos, sob pena de multa de R$ 10.000,00.

DISPOSIÇÕES GERAIS
Cláusula 14ª. Não haverá hierarquia nem subordinação entre as partes, inexistindo vínculo empregatício nos termos da Lei 13.429/17.
Cláusula 15ª. A contratada obriga-se a utilizar softwares originais e legítimos em seus equipamentos.

DO FORO
CLÁUSULA 16ª: As partes elegem o Foro de ${cidade} para dirimir controvérsias.

${cidade}, ${new Date().toLocaleDateString('pt-BR')}.`.trim();

    const dadosFinal = {
        titulo: `CONTRATO DE PRESTAÇÃO DE SERVIÇOS – ${servico}\nNº ${d.numero || '001'}`,
        textoParte1,
        textoParte2,
        dadosContratante: listaContratante,
        dadosContratado: listaContratado,
        contratante: contratanteNome,
        contratado: contratadoNome,
        tabelaPagamentos: tabelaPagamentos
    };

    const nomeDoArquivo = `contrato_${d.numero || Date.now()}.pdf`;
   // Executamos a função normalmente para garantir a impressão do PDF
    const resultadoOriginal = gerarPDF(nomeDoArquivo, dadosFinal, userId);

    // Retornamos um objeto que contém o PDF e também os dados para a tela
    return {
        stream: resultadoOriginal.stream,
        filePath: resultadoOriginal.filePath,
        dadosParaTela: dadosFinal // Aqui enviamos o objeto para o Controller
    };
};