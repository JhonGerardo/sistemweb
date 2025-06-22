
const moment = require('moment'); // Añade esto al inicio del archivo
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const app = express();

app.use(express.json());
app.use(cors({
  origin: 'http://localhost:3000',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// Pool MySQL único
const pool = mysql.createPool({
  connectionLimit: 10,
  host: '127.0.0.1',
  user: 'root',
  password: '',
  database: 'bdrecepcion',
  timezone: 'local',
  waitForConnections: true,
  queueLimit: 0
});

// Middleware para compartir el pool con todos los routers
app.use((req, res, next) => {
  req.pool = pool;
  next();
});

// Importa los routers
const empleadosRouter = require('./routes/empleados');
const registrosRouter = require('./routes/registros');
const visitasRouter = require('./routes/visitas');
app.use('/visitas', visitasRouter);


// Monta los routers
app.use('/empleados', empleadosRouter);
app.use('/registros', registrosRouter);
app.use('/visitas', visitasRouter);

app.get('/', (req, res) => {
  res.json({
    status: 'API funcionando',
    message: 'Bienvenido al sistema de registro'
  });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Error interno del servidor' });
});

const PORT = 5000;
app.listen(PORT, () => {
  console.log(`Servidor backend en http://localhost:${PORT}`);
});
