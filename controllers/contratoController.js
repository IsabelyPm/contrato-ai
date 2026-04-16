// Remova as duas linhas antigas e use apenas esta:
const gerarContrato = require("../utils/gerarPDF"); // O require aponta para o ARQUIVO onde está o module.exports
const gerarNumeroContrato = require("../utils/contador");
const path = require("path");

exports.home = (req, res) => res.render("pages/index");

exports.gerar = (req, res) => {
    try {
        const dadosFormulario = req.body;
        const userId = req.session.userId; // PEGA O ID DA SESSÃO

        if (!userId) {
            return res.status(401).send("Sessão expirada. Faça login novamente.");
        }

        dadosFormulario.numero = gerarNumeroContrato();
        
        // PASSAMOS O USERID PARA A FUNÇÃO DE GERAR
        const resultado = gerarContrato(dadosFormulario, userId); 

        if (!resultado || !resultado.stream) {
            throw new Error("O arquivo utilitário não retornou o stream.");
        }

        const nomeArquivoReal = path.basename(resultado.filePath);

        resultado.stream.on('finish', () => {
            const d = resultado.dadosParaTela;
            res.render("pages/resultado", { 
                numero: dadosFormulario.numero, 
                arquivo: nomeArquivoReal, 
                userId: req.session.userId,
                servico: dadosFormulario.servico,
                contrato: `${d.titulo}\n\n${d.textoParte1}\n\n${d.textoParte2}`
            });
        });

    } catch (error) {
        console.error("Erro detalhado:", error);
        res.status(500).send("Erro ao processar contrato: " + error.message);
    }
};