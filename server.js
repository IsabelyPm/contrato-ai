require('dotenv').config();
const express = require("express");
const bodyParser = require("body-parser");
const fs = require("fs");
const path = require('path');
const bcrypt = require('bcryptjs');
const db = require('./database'); 
const session = require('express-session'); // Subi o require para o topo
const helmet = require('helmet');

const app = express();

const contratoRoutes = require("./routes/contratoRoutes");

const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 100, // Limita cada IP a 100 requisições por janela
    validate: { xForwardedForHeader: false },
    message: "Muitas requisições vindas deste IP, tente novamente mais tarde."
});
app.set('trust proxy', 1);
// 1. CONFIGURAÇÕES (Sempre primeiro)
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static("public"));
app.use("/contratos", express.static(path.join(__dirname, "contratos")));

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        "default-src": ["'self'"],
        "script-src": ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
        "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdn.jsdelivr.net"],
        "img-src": ["'self'", "data:", "blob:"], // Adicione 'blob:' se necessário
        "font-src": ["'self'", "https://fonts.gstatic.com"],
        "connect-src": ["'self'"]
      },
    },
  })
);

// 2. CONFIGURAÇÃO DA SESSÃO (Tem que vir antes de qualquer rota!)
app.use(session({
    secret: process.env.SESSION_SECRET || 'fallback-para-dev-apenas', // Puxa do .env
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: true, // No Railway é HTTPS, então precisa ser true
        sameSite: 'lax', // Ajuda o navegador a aceitar o cookie
        maxAge: 3600000
    }
}));
app.use((req, res, next) => {
    res.locals.userId = req.session.userId || null;
    res.locals.usuarioNome = req.session.usuarioNome || null;
    next();
});
// Aplica o limite apenas nas rotas de login e geração
app.use("/login", limiter);
app.use("/api/gerar-contrato", limiter);
// 3. ROTAS DE AUTENTICAÇÃO (Login e Cadastro)
app.get('/cadastro', (req, res) => res.render('pages/cadastro'));

app.post('/cadastro', async (req, res) => {
    const { nome, email, senha } = req.body;
    try {
        const senhaHash = await bcrypt.hash(senha, 10);
        await db.query('INSERT INTO users (nome, email, senha) VALUES (?, ?, ?)', [nome, email, senhaHash]);
        
        // Redireciona para o login passando um aviso de sucesso
        res.redirect('/login?sucesso=true');
    } catch (error) {
        console.error(error);
        res.redirect('/cadastro?erro=email_duplicado');
    }
});

app.get('/login', (req, res) => res.render('pages/login'));

app.post('/login', async (req, res) => {
    const { email, senha } = req.body;
    try {
        const [users] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
        
        // 1. Se não achar o e-mail
        if (users.length === 0) {
            return res.redirect('/login?erro=usuario_nao_encontrado');
        }

        const usuario = users[0];
        const senhaValida = await bcrypt.compare(senha, usuario.senha);

        // 2. Se a senha bater
        if (senhaValida) {
            req.session.userId = usuario.id; 
            req.session.usuarioNome = usuario.nome;
            return res.redirect('/'); // IMPORTANTE: return aqui!
        } 
        
        // 3. Se a senha NÃO bater (usamos o else ou apenas o fluxo normal)
        return res.redirect("/login?erro=1");

    } catch (error) {
        console.error("Erro no servidor:", error);
        // Só tenta redirecionar se ainda não tiver enviado resposta
        if (!res.headersSent) {
            return res.redirect('/login?erro=erro_servidor');
        }
    }
});
// 4. ROTA PRINCIPAL PROTEGIDA (Tem que vir ANTES do app.use("/", contratoRoutes))
app.get('/', (req, res) => {
    if (!req.session.userId) {
        return res.redirect('/login');
    }
    res.render('pages/index', { nomeUsuario: req.session.usuarioNome });
});

// 5. OUTRAS ROTAS DO PROJETO
app.use("/", contratoRoutes);

app.get("/meus-contratos", (req, res) => {
    if (!req.session.userId) return res.redirect('/login');

    // Provavelmente está apenas assim: res.render("pages/lista_contratos");
    // ALTERE PARA ENVIAR O USERID:
    res.render("pages/lista_contratos", { 
        userId: req.session.userId 
    }); 
});

app.get("/api/listar-contratos", (req, res) => {
    // Se não tiver sessão, ele manda 401
    if (!req.session.userId) {
        return res.status(401).json({ erro: "Não autorizado" });
    }

    const userId = req.session.userId;
    const pastaUsuario = path.join(__dirname, "contratos", String(userId));

    // Se a pasta não existir ainda, retornamos um array vazio (evita o erro do .map)
    if (!fs.existsSync(pastaUsuario)) {
        return res.json([]); 
    }

    fs.readdir(pastaUsuario, (err, files) => {
        if (err) return res.status(500).json({ erro: "Erro ao ler" });
        const pdfs = files.filter(f => f.toLowerCase().endsWith(".pdf"));
        res.json(pdfs); // Retorna o array de nomes de arquivos
    });
});

const PORT = process.env.PORT || 3000; // Usa a porta da hospedagem ou 3000
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor pronto na porta ${PORT}`);
});
app.get('/perfil', async (req, res) => {
    if (!req.session.userId) return res.redirect('/login');

    try {
        const [users] = await db.query('SELECT nome, email, telefone, foto_perfil FROM users WHERE id = ?', [req.session.userId]);
        const usuario = users[0];
        
        res.render('pages/perfil', { usuario });
    } catch (error) {
        res.status(500).send("Erro ao carregar perfil");
    }
});
const multer = require('multer');

// Configuração de onde e como salvar a foto
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/images/'); // Sua pasta atual
    },
    filename: (req, file, cb) => {
        // Gera um nome: ID-Data-NomeOriginal.jpg
        const extensao = path.extname(file.originalname);
        cb(null, `${req.session.userId}-${Date.now()}${extensao}`);
    }
});

const upload = multer({ storage: storage });
app.post('/perfil/atualizar', upload.single('foto'), async (req, res) => {
    // 1. Verificação de Segurança
    if (!req.session.userId) return res.redirect('/login');

    // 2. O Multer já passou por aqui, então req.body NÃO deve ser mais NULL
    const { nome, telefone, novaSenha } = req.body;
    const userId = req.session.userId;

    // DEBUG: Se no terminal aparecer {}, o problema é o enctype no HTML
    console.log("Conteúdo do Body:", req.body);

    try {
        // 3. Só tenta atualizar se o nome não for nulo/vazio
        if (!nome) {
            console.error("ERRO: O nome chegou vazio do formulário.");
            return res.redirect('/perfil?erro=dados_vazios');
        }

        // 4. Atualiza os dados de texto primeiro
        await db.query(
            'UPDATE users SET nome = ?, telefone = ? WHERE id = ?',
            [nome, telefone, userId]
        );
        
        req.session.usuarioNome = nome; // Atualiza nome na sessão

        // 5. Se houver um arquivo, atualiza a foto
        if (req.file) {
            const fotoNome = req.file.filename;
            await db.query('UPDATE users SET foto_perfil = ? WHERE id = ?', [fotoNome, userId]);
        }

        // 6. Se houver nova senha
        if (novaSenha && novaSenha.trim() !== "") {
            const senhaHash = await bcrypt.hash(novaSenha, 10);
            await db.query('UPDATE users SET senha = ? WHERE id = ?', [senhaHash, userId]);
        }

        res.redirect('/perfil?sucesso=true');

    } catch (error) {
        console.error("Erro detalhado no MySQL:", error);
        res.redirect('/perfil?erro=true');
    }
});
app.post("/api/excluir-contrato", (req, res) => {
    const { nomeArquivo } = req.body;

    // PROTEÇÃO: Aqui a gente limpa o nome
    // Se vier "../../server.js", vira só "server.js"
    const nomeLimpo = path.basename(nomeArquivo);

    // Agora montamos o caminho com o nome já limpo
    const caminhoArquivo = path.join(__dirname, "contratos", String(req.session.userId), nomeLimpo);

    if (fs.existsSync(caminhoArquivo)) {
        // Agora é seguro deletar!
        fs.unlink(caminhoArquivo, (err) => {
            if (err) return res.status(500).send("Erro ao deletar");
            res.send("Arquivo excluído!");
        });
    } else {
        res.status(404).send("Arquivo não existe na SUA pasta.");
    }
});

// Rota para encerrar a sessão
app.get("/logout", (req, res) => {
    // Destrói a sessão no servidor
    req.session.destroy((err) => {
        if (err) {
            console.log("Erro ao encerrar sessão:", err);
            return res.redirect("/");
        }
        
        // Limpa o cookie que identifica a sessão no navegador
        res.clearCookie("connect.sid"); // O nome padrão do cookie do express-session é 'connect.sid'
        
        // Redireciona para a página de login
        res.redirect("/login"); 
    });
});