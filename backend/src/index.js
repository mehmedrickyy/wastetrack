import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import { promisify } from 'node:util'
import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { pool } from './db.js'

const app = express()
const port = Number(process.env.PORT ?? 4000)
const scrypt = promisify(scryptCallback)
const allowedTransitions = {
  pending: ['assigned', 'cancelled'],
  assigned: ['picked_up', 'cancelled'],
  picked_up: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
}
const availableRewards = {
  'wallet-10': { name: 'Saldo e-wallet Rp 10.000', points: 2500 },
  'wallet-25': { name: 'Saldo e-wallet Rp 25.000', points: 6000 },
  groceries: { name: 'Voucher belanja Rp 20.000', points: 4000 },
}
const pickupStatusMessages = {
  assigned: (name, id) => `Halo ${name}, petugas telah ditugaskan untuk penjemputan ke${id} anda. Silakan tunggu konfirmasi penjemputan beriktnya.`,
  picked_up: (name, id) => `Halo ${name}, setoran ke${id} telah dijemput. Menunggu verifikasi admin.`,
  completed: (name, id) => `Halo ${name}, setoran ke${id} telah selesai diverifikasi. Poin sudah ditambahkan ke akun Anda.`,
}

app.use(cors({ origin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173' }))
app.use(express.json({ limit: '32kb' }))

function normalizeWhatsappTarget(phone) {
  const digits = String(phone ?? '').replace(/\D/g, '')
  if (digits.length < 8 || digits.length > 15) return null

  if (digits.startsWith('62')) {
    return { target: digits.slice(2), countryCode: '62' }
  }

  if (digits.startsWith('0')) {
    return { target: digits.slice(1), countryCode: '62' }
  }

  if (digits.startsWith('8')) {
    return { target: digits, countryCode: '62' }
  }

  return { target: digits, countryCode: '62' }
}

async function sendWhatsappNotification(phone, message) {
  const token = process.env.FONNTE_TOKEN?.trim()
  if (!token) return 'not_configured'
  if (typeof phone !== 'string' || !phone.trim()) return 'missing_phone'

  const recipient = normalizeWhatsappTarget(phone)
  if (!recipient) return 'invalid_phone'

  const body = new URLSearchParams({
    target: recipient.target,
    message,
    countryCode: recipient.countryCode,
  })

  try {
    const response = await fetch('https://api.fonnte.com/send', {
      method: 'POST',
      headers: { Authorization: token, 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(10000),
    })
    const responseBody = await response.text()
    let result
    try {
      result = JSON.parse(responseBody)
    } catch {
      result = null
    }
    if (!response.ok || result?.status !== true) {
      console.error('Fonnte WhatsApp notification failed.', { status: response.status })
      return 'failed'
    }
    return 'sent'
  } catch (error) {
    console.error('Fonnte WhatsApp notification request failed:', error instanceof Error ? error.message : String(error))
    return 'failed'
  }
}

function parseId(value) {
  const id = Number(value)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

function parseWeight(value) {
  const weight = Number(value)
  return Number.isFinite(weight) && weight > 0 ? weight : null
}

function isDuplicateEmailError(error) {
  return typeof error?.message === 'string'
    && error.message.includes('UNIQUE constraint failed: users.email')
}

async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  const hash = await scrypt(password, salt, 64)
  return `scrypt$${salt}$${hash.toString('hex')}`
}

async function verifyPassword(password, encoded) {
  const [algorithm, salt, storedHash] = String(encoded).split('$')
  if (algorithm !== 'scrypt' || !salt || !storedHash) return false
  const expected = Buffer.from(storedHash, 'hex')
  const actual = await scrypt(password, salt, expected.length)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex')
}

async function createSession(userId) {
  const token = randomBytes(32).toString('hex')
  await pool.execute(
    'INSERT INTO user_sessions (token_hash, user_id, expires_at) VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 12 HOUR))',
    [hashToken(token), userId],
  )
  return token
}

async function requireAuth(request, response, next) {
  const authorization = request.get('authorization') ?? ''
  const [scheme, token, extra] = authorization.split(' ')
  if (scheme !== 'Bearer' || !token || extra || !/^[a-f0-9]{64}$/.test(token)) {
    return response.status(401).json({ error: 'Silakan masuk untuk melanjutkan.' })
  }

  try {
    const sessionHash = hashToken(token)
    const [users] = await pool.execute(
      `SELECT u.user_id, u.name, u.email, u.role, u.phone, u.address, u.balance_points
        FROM user_sessions s JOIN users u ON u.user_id = s.user_id
        WHERE s.token_hash = ? AND s.expires_at > UTC_TIMESTAMP()`,
      [sessionHash],
    )
    if (!users[0]) return response.status(401).json({ error: 'Sesi tidak valid atau telah berakhir. Silakan masuk kembali.' })
    request.sessionHash = sessionHash
    request.user = users[0]
    next()
  } catch (error) {
    next(error)
  }
}

function requireRole(...roles) {
  return (request, response, next) => {
    if (!roles.includes(request.user.role)) {
      return response.status(403).json({ error: 'Anda tidak memiliki akses ke fitur ini.' })
    }
    next()
  }
}

function publicUser(user) {
  return {
    id: user.user_id,
    name: user.name,
    email: user.email,
    role: user.role,
    phone: user.phone ?? '',
    address: user.address ?? '',
    balancePoints: Number(user.balance_points),
  }
}

app.get('/api/health', (_request, response) => {
  response.json({ status: 'ok', service: 'wastetrack-api' })
})

app.post('/api/auth/register', async (request, response, next) => {
  const { name, email, password, phone, address } = request.body
  if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 100
    || typeof email !== 'string' || email.trim().length > 100
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    || typeof password !== 'string' || password.length < 8 || password.length > 128) {
    return response.status(400).json({ error: 'Nama, email valid, dan kata sandi minimal 8 karakter wajib diisi.' })
  }
  if ((phone !== undefined && (typeof phone !== 'string' || phone.length > 20))
    || (address !== undefined && (typeof address !== 'string' || address.length > 1000))) {
    return response.status(400).json({ error: 'Nomor telepon atau alamat tidak valid.' })
  }
  try {
    const passwordHash = await hashPassword(password)
    const [result] = await pool.execute(
      'INSERT INTO users (name, email, password, phone, address, role) VALUES (?, ?, ?, ?, ?, ?)',
      [name.trim(), email.trim().toLowerCase(), passwordHash, phone?.trim() || null, address?.trim() || null, 'nasabah'],
    )
    const user = {
      user_id: result.insertId,
      name: name.trim(),
      email: email.trim().toLowerCase(),
      role: 'nasabah',
      balance_points: 0,
    }
    response.status(201).json({ data: { user: publicUser(user), token: await createSession(user.user_id) } })
  } catch (error) {
    if (isDuplicateEmailError(error)) {
      return response.status(409).json({ error: 'Email sudah terdaftar.' })
    }
    next(error)
  }
})

app.post('/api/auth/login', async (request, response, next) => {
  const { email, password } = request.body
  if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
    return response.status(400).json({ error: 'Email dan kata sandi wajib diisi.' })
  }
  try {
    const [users] = await pool.execute(
      'SELECT user_id, name, email, password, role, balance_points FROM users WHERE email = ?',
      [email.trim().toLowerCase()],
    )
    const user = users[0]
    if (!user || !(await verifyPassword(password, user.password))) {
      return response.status(401).json({ error: 'Email atau kata sandi tidak sesuai.' })
    }
    response.json({ data: { user: publicUser(user), token: await createSession(user.user_id) } })
  } catch (error) {
    next(error)
  }
})

app.get('/api/auth/me', requireAuth, (request, response) => {
  response.json({ data: { user: publicUser(request.user) } })
})

app.patch('/api/auth/profile', requireAuth, async (request, response, next) => {
  const { name, email, phone, address } = request.body
  if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 100
    || typeof email !== 'string' || email.trim().length > 100
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    || (phone !== undefined && (typeof phone !== 'string' || phone.length > 20))
    || (address !== undefined && (typeof address !== 'string' || address.length > 1000))) {
    return response.status(400).json({ error: 'Nama dan email valid wajib diisi. Nomor telepon atau alamat tidak valid.' })
  }
  try {
    await pool.execute(
      'UPDATE users SET name = ?, email = ?, phone = ?, address = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?',
      [name.trim(), email.trim().toLowerCase(), phone?.trim() || null, address?.trim() || null, request.user.user_id],
    )
    const [users] = await pool.execute(
      'SELECT user_id, name, email, role, phone, address, balance_points FROM users WHERE user_id = ?',
      [request.user.user_id],
    )
    if (!users[0]) return response.status(404).json({ error: 'Pengguna tidak ditemukan.' })
    response.json({ data: { user: publicUser(users[0]) } })
  } catch (error) {
    if (isDuplicateEmailError(error)) return response.status(409).json({ error: 'Email sudah digunakan akun lain.' })
    next(error)
  }
})

app.post('/api/auth/logout', requireAuth, async (request, response, next) => {
  try {
    await pool.execute('DELETE FROM user_sessions WHERE token_hash = ?', [request.sessionHash])
    response.json({ data: { message: 'Berhasil keluar.' } })
  } catch (error) {
    next(error)
  }
})

app.get('/api/admin/users', requireAuth, requireRole('admin'), async (_request, response, next) => {
  try {
    const [users] = await pool.execute(
      "SELECT user_id, name, email, role, balance_points, created_at FROM users WHERE role IN ('petugas', 'nasabah') ORDER BY created_at DESC",
    )
    response.json({ data: users.map((user) => ({ ...publicUser(user), createdAt: user.created_at })) })
  } catch (error) {
    next(error)
  }
})

app.post('/api/admin/users', requireAuth, requireRole('admin'), async (request, response, next) => {
  const { name, email, password, role } = request.body
  if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 100
    || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    || typeof password !== 'string' || password.length < 8 || password.length > 128
    || !['petugas', 'admin'].includes(role)) {
    return response.status(400).json({ error: 'Nama, email, kata sandi minimal 8 karakter, dan peran yang valid wajib diisi.' })
  }
  try {
    const passwordHash = await hashPassword(password)
    const [result] = await pool.execute(
      'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
      [name.trim(), email.trim().toLowerCase(), passwordHash, role],
    )
    response.status(201).json({
      data: { user: publicUser({ user_id: result.insertId, name: name.trim(), email: email.trim().toLowerCase(), role, balance_points: 0 }) },
    })
  } catch (error) {
    if (isDuplicateEmailError(error)) return response.status(409).json({ error: 'Email sudah terdaftar.' })
    next(error)
  }
})

app.post('/api/rewards/redeem', requireAuth, requireRole('nasabah'), async (request, response, next) => {
  const rewardId = request.body?.rewardId
  const reward = typeof rewardId === 'string' && Object.hasOwn(availableRewards, rewardId)
    ? availableRewards[rewardId]
    : null
  if (!reward) return response.status(400).json({ error: 'Hadiah tidak tersedia.' })

  let connection
  try {
    connection = await pool.getConnection()
    await connection.beginTransaction()
    const [users] = await connection.execute(
      'SELECT balance_points FROM users WHERE user_id = ? FOR UPDATE',
      [request.user.user_id],
    )
    if (!users[0] || Number(users[0].balance_points) < reward.points) {
      await connection.rollback()
      return response.status(409).json({ error: 'Poin kamu belum cukup untuk penukaran ini.' })
    }
    await connection.execute(
      'UPDATE users SET balance_points = balance_points - ? WHERE user_id = ?',
      [reward.points, request.user.user_id],
    )
    const [result] = await connection.execute(
      'INSERT INTO point_redemptions (user_id, reward_id, reward_name, points_spent) VALUES (?, ?, ?, ?)',
      [request.user.user_id, rewardId, reward.name, reward.points],
    )
    await connection.commit()
    response.status(201).json({ data: { redemptionId: result.insertId, pointsSpent: reward.points } })
  } catch (error) {
    if (connection) await connection.rollback()
    next(error)
  } finally {
    connection?.release()
  }
})

app.get('/api/categories', async (_request, response, next) => {
  try {
    const [categories] = await pool.execute(
      'SELECT category_id, category_name, description, points_per_kg FROM waste_categories ORDER BY category_name',
    )
    response.json({ data: categories })
  } catch (error) {
    next(error)
  }
})

app.get('/api/dashboard/summary', requireAuth, async (request, response, next) => {
  const userId = request.user.user_id
  try {
    const [rows] = await pool.execute(
      `SELECT
        (SELECT COUNT(*) FROM pickup_transactions WHERE user_id = ?) AS total_pickups,
        (SELECT COALESCE(SUM(total_points), 0) FROM pickup_transactions WHERE user_id = ? AND status = 'completed') AS total_points,
        (SELECT COALESCE(SUM(td.weight_kg), 0)
          FROM transaction_details td
          JOIN pickup_transactions pt ON pt.transaction_id = td.transaction_id
          WHERE pt.user_id = ? AND pt.status = 'completed') AS total_weight_kg,
        (SELECT balance_points FROM users WHERE user_id = ?) AS balance_points`,
      [userId, userId, userId, userId],
    )
    if (rows[0].balance_points === null) return response.status(404).json({ error: 'Pengguna tidak ditemukan.' })
    response.json({ data: rows[0] })
  } catch (error) {
    next(error)
  }
})

app.get('/api/pickups', requireAuth, async (request, response, next) => {
  try {
    const filter = request.user.role === 'nasabah'
      ? 'WHERE pt.user_id = ?'
      : request.user.role === 'petugas'
        ? "WHERE pt.petugas_id = ? OR pt.status = 'pending'"
        : ''
    const parameters = request.user.role === 'admin' ? [] : [request.user.user_id]
    const [pickups] = await pool.execute(
      `SELECT pt.transaction_id, pt.user_id, u.name AS customer_name,
          CASE WHEN ? = 'petugas' THEN u.phone ELSE NULL END AS customer_phone, pt.petugas_id,
          pt.pickup_date, pt.pickup_address, pt.status, pt.total_points, pt.created_at,
          COALESCE(details.weight_kg, 0) AS weight_kg, details.waste_type
        FROM pickup_transactions pt
        JOIN users u ON u.user_id = pt.user_id
        LEFT JOIN (
          SELECT td.transaction_id, SUM(td.weight_kg) AS weight_kg, MIN(wc.category_name) AS waste_type
          FROM transaction_details td
          JOIN waste_categories wc ON wc.category_id = td.category_id
          GROUP BY td.transaction_id
        ) details ON details.transaction_id = pt.transaction_id
        ${filter}
        ORDER BY pt.created_at DESC`,
      [request.user.role, ...parameters],
    )
    response.json({ data: pickups })
  } catch (error) {
    next(error)
  }
})

app.post('/api/pickups', requireAuth, requireRole('nasabah'), async (request, response, next) => {
  const userId = request.user.user_id
  const { pickupDate, pickupAddress, details } = request.body
  if (typeof pickupDate !== 'string' || Number.isNaN(Date.parse(pickupDate)) || typeof pickupAddress !== 'string' || !pickupAddress.trim()) {
    return response.status(400).json({ error: 'pickupDate dan pickupAddress wajib diisi dengan benar.' })
  }
  if (!Array.isArray(details) || details.length === 0 || details.length > 20) {
    return response.status(400).json({ error: 'Setoran harus memiliki 1 sampai 20 detail sampah.' })
  }

  const parsedDetails = details.map((detail) => ({
    categoryId: parseId(detail.categoryId),
    weightKg: parseWeight(detail.weightKg),
  }))
  if (parsedDetails.some((detail) => !detail.categoryId || !detail.weightKg)) {
    return response.status(400).json({ error: 'Setiap detail memerlukan categoryId dan weightKg positif.' })
  }

  let connection
  try {
    connection = await pool.getConnection()
    await connection.beginTransaction()
    const [users] = await connection.execute('SELECT user_id, name, phone FROM users WHERE user_id = ?', [userId])
    if (users.length === 0) {
      await connection.rollback()
      return response.status(404).json({ error: 'Pengguna tidak ditemukan.' })
    }

    const [pickupResult] = await connection.execute(
      'INSERT INTO pickup_transactions (user_id, pickup_date, pickup_address) VALUES (?, ?, ?)',
      [userId, pickupDate, pickupAddress.trim()],
    )
    let estimatedPoints = 0
    for (const detail of parsedDetails) {
      const [categories] = await connection.execute(
        'SELECT points_per_kg FROM waste_categories WHERE category_id = ?',
        [detail.categoryId],
      )
      if (categories.length === 0) {
        await connection.rollback()
        return response.status(400).json({ error: `Kategori ${detail.categoryId} tidak ditemukan.` })
      }
      const rate = Number(categories[0].points_per_kg)
      estimatedPoints += detail.weightKg * rate
      await connection.execute(
        `INSERT INTO transaction_details
          (transaction_id, category_id, weight_kg, points_per_kg_snapshot, points_earned)
          VALUES (?, ?, ?, ?, 0)`,
        [pickupResult.insertId, detail.categoryId, detail.weightKg, rate],
      )
    }

    await connection.commit()
    const notification = await sendWhatsappNotification(
      users[0].phone,
      `Halo ${users[0].name}, permintaan penjemputan #${pickupResult.insertId} sudah kami terima. Status: menunggu petugas.`,
    )
    response.status(201).json({
      data: {
        transactionId: pickupResult.insertId,
        status: 'pending',
        estimatedPoints: Math.round(estimatedPoints * 100) / 100,
        notification,
      },
    })
  } catch (error) {
    if (connection) await connection.rollback()
    next(error)
  } finally {
    connection?.release()
  }
})

app.patch('/api/pickups/:id/status', requireAuth, requireRole('petugas', 'admin'), async (request, response, next) => {
  const transactionId = parseId(request.params.id)
  const { status, details } = request.body
  if (!transactionId || typeof status !== 'string' || !Object.hasOwn(allowedTransitions, status)) {
    return response.status(400).json({ error: 'ID atau status transaksi tidak valid.' })
  }
  if ((request.user.role === 'petugas' && !['assigned', 'picked_up'].includes(status))
    || (request.user.role === 'admin' && status !== 'completed')) {
    return response.status(403).json({ error: 'Peran Anda tidak dapat mengubah transaksi ke status tersebut.' })
  }

  let connection
  try {
    connection = await pool.getConnection()
    await connection.beginTransaction()
    const [pickups] = await connection.execute(
      `SELECT pt.transaction_id, pt.user_id, pt.petugas_id, pt.status, u.name AS customer_name, u.phone AS customer_phone
        FROM pickup_transactions pt JOIN users u ON u.user_id = pt.user_id
        WHERE pt.transaction_id = ? FOR UPDATE`,
      [transactionId],
    )
    const pickup = pickups[0]
    if (!pickup) {
      await connection.rollback()
      return response.status(404).json({ error: 'Transaksi tidak ditemukan.' })
    }
    if (request.user.role === 'petugas' && pickup.petugas_id !== null && pickup.petugas_id !== request.user.user_id) {
      await connection.rollback()
      return response.status(403).json({ error: 'Transaksi ini telah ditugaskan kepada petugas lain.' })
    }
    if (request.user.role === 'petugas' && status === 'assigned') {
      await connection.execute('UPDATE pickup_transactions SET petugas_id = ? WHERE transaction_id = ?', [request.user.user_id, transactionId])
    }
    if (request.user.role === 'admin' && status === 'completed' && pickup.status !== 'picked_up') {
      await connection.rollback()
      return response.status(409).json({ error: 'Hanya setoran yang sudah dijemput yang dapat divalidasi.' })
    }
    if (!allowedTransitions[pickup.status].includes(status)) {
      await connection.rollback()
      return response.status(409).json({ error: `Status ${pickup.status} tidak dapat diubah menjadi ${status}.` })
    }

    if (status === 'completed') {
      if (details !== undefined) {
        if (!Array.isArray(details)) {
          await connection.rollback()
          return response.status(400).json({ error: 'details harus berupa array.' })
        }
        for (const detail of details) {
          const detailId = parseId(detail.detailId)
          const weightKg = parseWeight(detail.weightKg)
          if (!detailId || !weightKg) {
            await connection.rollback()
            return response.status(400).json({ error: 'Setiap detail memerlukan detailId dan weightKg positif.' })
          }
          await connection.execute(
            'UPDATE transaction_details SET weight_kg = ? WHERE detail_id = ? AND transaction_id = ?',
            [weightKg, detailId, transactionId],
          )
        }
      }

      const [transactionDetails] = await connection.execute(
        'SELECT detail_id, weight_kg, points_per_kg_snapshot FROM transaction_details WHERE transaction_id = ?',
        [transactionId],
      )
      let totalPoints = 0
      for (const detail of transactionDetails) {
        const points = Number(detail.weight_kg) * Number(detail.points_per_kg_snapshot)
        totalPoints += points
        await connection.execute(
          'UPDATE transaction_details SET points_earned = ? WHERE detail_id = ?',
          [Math.round(points * 100) / 100, detail.detail_id],
        )
      }
      totalPoints = Math.round(totalPoints * 100) / 100
      await connection.execute(
        'UPDATE pickup_transactions SET total_points = ? WHERE transaction_id = ?',
        [totalPoints, transactionId],
      )
      await connection.execute(
        'UPDATE users SET balance_points = balance_points + ? WHERE user_id = ?',
        [totalPoints, pickup.user_id],
      )
    }

    await connection.execute('UPDATE pickup_transactions SET status = ? WHERE transaction_id = ?', [status, transactionId])
    await connection.commit()
    const notification = await sendWhatsappNotification(
      pickup.customer_phone,
      pickupStatusMessages[status](pickup.customer_name, transactionId),
    )
    response.json({ data: { transactionId, status, notification } })
  } catch (error) {
    if (connection) await connection.rollback()
    next(error)
  } finally {
    connection?.release()
  }
})

app.use((error, _request, response, _next) => {
  console.error(error)
  response.status(500).json({ error: 'Terjadi kesalahan pada server.' })
})

async function startServer() {
  const bootstrapEmail = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase()
  const bootstrapPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD
  const bootstrapName = process.env.BOOTSTRAP_ADMIN_NAME?.trim()
  if (!bootstrapEmail || !bootstrapPassword || !bootstrapName) {
    throw new Error('Atur BOOTSTRAP_ADMIN_NAME, BOOTSTRAP_ADMIN_EMAIL, dan BOOTSTRAP_ADMIN_PASSWORD di backend/.env.')
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(bootstrapEmail) || bootstrapPassword.length < 8 || bootstrapPassword.length > 128) {
    throw new Error('Email admin awal harus valid dan kata sandi harus sepanjang 8–128 karakter.')
  }
  await pool.execute('DELETE FROM user_sessions WHERE expires_at <= UTC_TIMESTAMP()')

  const [existing] = await pool.execute('SELECT user_id, role FROM users WHERE email = ?', [bootstrapEmail])
  if (existing.length === 0) {
    await pool.execute(
      'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
      [bootstrapName, bootstrapEmail, await hashPassword(bootstrapPassword), 'admin'],
    )
    console.log(`Akun admin awal dibuat: ${bootstrapEmail}`)
  } else if (existing[0].role !== 'admin') {
    throw new Error('Email BOOTSTRAP_ADMIN_EMAIL sudah digunakan oleh akun non-admin.')
  }

  app.listen(port, () => {
    console.log(`WasteTrack API berjalan di http://localhost:${port}`)
  })
}

startServer().catch((error) => {
  console.error('Gagal menjalankan WasteTrack API:', error)
  process.exitCode = 1
})