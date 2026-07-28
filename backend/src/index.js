require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const mothersRoutes = require('./routes/mothers');
const pregnanciesRoutes = require('./routes/pregnancies');
const ancRoutes = require('./routes/anc');
const laborRoutes = require('./routes/labor');
const emergenciesRoutes = require('./routes/emergencies');
const deliveriesRoutes = require('./routes/deliveries');
const postpartumRoutes = require('./routes/postpartum');
const communityRoutes = require('./routes/community');
const analyticsRoutes = require('./routes/analytics');
const adminRoutes = require('./routes/admin');
const ambulanceRoutes = require('./routes/ambulance');
const investigationsRoutes = require('./routes/investigations');

const app = express();
const PORT = process.env.PORT || 5001;

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({
  origin: (origin, callback) => {
    const allowed = (process.env.CORS_ORIGIN || 'http://localhost:5173')
      .split(',')
      .map((s) => s.trim());
    if (!origin || allowed.includes(origin) || /\.vercel\.app$/.test(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));
app.use(express.json({ limit: '2mb' }));

app.get('/', (_req, res) => {
  res.json({
    service: 'RMDP API — Rwanda Maternal Digital Platform',
    status: 'ok',
    version: '1.0.0',
    health: '/api/health',
    docs: 'https://github.com/cracker38/Maternal',
  });
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'RMDP API', time: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/mothers', mothersRoutes);
app.use('/api/pregnancies', pregnanciesRoutes);
app.use('/api/anc', ancRoutes);
app.use('/api/labor', laborRoutes);
app.use('/api/emergencies', emergenciesRoutes);
app.use('/api/deliveries', deliveriesRoutes);
app.use('/api/postpartum', postpartumRoutes);
app.use('/api/community', communityRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/ambulance', ambulanceRoutes);
app.use('/api/investigations', investigationsRoutes);

app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`RMDP API listening on http://localhost:${PORT}`);
});
