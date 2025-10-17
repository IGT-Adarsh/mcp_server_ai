CREATE TABLE clinics (
  clinic_id INTEGER PRIMARY KEY AUTOINCREMENT,
  name VARCHAR(255),
  address VARCHAR(255),
  phone VARCHAR(20),
  email VARCHAR(100),
  owner_id INTEGER
);

CREATE TABLE users (
  user_id INTEGER PRIMARY KEY AUTOINCREMENT,
  clinic_id INTEGER,
  role VARCHAR(50),
  name VARCHAR(100),
  email VARCHAR(100),
  phone VARCHAR(20),
  password_hash VARCHAR(255),
  is_active BOOLEAN
);

CREATE TABLE patients (
  patient_id INTEGER PRIMARY KEY AUTOINCREMENT,
  clinic_id INTEGER,
  name VARCHAR(100),
  dob DATE,
  gender VARCHAR(10),
  phone VARCHAR(20),
  email VARCHAR(100),
  address VARCHAR(255),
  allergies TEXT,
  notes TEXT
);

CREATE TABLE appointments (
  appointment_id INTEGER PRIMARY KEY AUTOINCREMENT,
  clinic_id INTEGER,
  patient_id INTEGER,
  doctor_id INTEGER,
  scheduled_time DATETIME,
  status VARCHAR(50),
  queue_token INTEGER,
  is_online BOOLEAN,
  created_at DATETIME
);

CREATE TABLE visit_notes (
  note_id INTEGER PRIMARY KEY AUTOINCREMENT,
  appointment_id INTEGER,
  doctor_id INTEGER,
  patient_id INTEGER,
  visit_date DATE,
  notes TEXT,
  vitals TEXT,
  lab_reports TEXT
);

CREATE TABLE prescriptions (
  prescription_id INTEGER PRIMARY KEY AUTOINCREMENT,
  appointment_id INTEGER,
  doctor_id INTEGER,
  patient_id INTEGER,
  date_issued DATE,
  content TEXT,
  language VARCHAR(50),
  shared_via VARCHAR(50)
);

CREATE TABLE bills (
  bill_id INTEGER PRIMARY KEY AUTOINCREMENT,
  appointment_id INTEGER,
  patient_id INTEGER,
  clinic_id INTEGER,
  amount DECIMAL(10,2),
  discount DECIMAL(10,2),
  payment_method VARCHAR(50),
  status VARCHAR(50),
  created_at DATETIME
);

CREATE TABLE payments (
  payment_id INTEGER PRIMARY KEY AUTOINCREMENT,
  bill_id INTEGER,
  amount_paid DECIMAL(10,2),
  payment_date DATETIME,
  payment_mode VARCHAR(50),
  transaction_id VARCHAR(100)
);

CREATE TABLE reminders (
  reminder_id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER,
  appointment_id INTEGER,
  type VARCHAR(50),
  message TEXT,
  scheduled_time DATETIME,
  sent_via VARCHAR(50),
  status VARCHAR(50)
);

CREATE TABLE feedback (
  feedback_id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER,
  appointment_id INTEGER,
  doctor_id INTEGER,
  rating INTEGER,
  comments TEXT,
  created_at DATETIME
);

CREATE TABLE reports (
  report_id INTEGER PRIMARY KEY AUTOINCREMENT,
  clinic_id INTEGER,
  type VARCHAR(50),
  period_start DATE,
  period_end DATE,
  data TEXT,
  generated_at DATETIME
);

CREATE TABLE teleconsultations (
  teleconsultation_id INTEGER PRIMARY KEY AUTOINCREMENT,
  appointment_id INTEGER,
  doctor_id INTEGER,
  patient_id INTEGER,
  video_link VARCHAR(255),
  status VARCHAR(50),
  started_at DATETIME,
  ended_at DATETIME
);

CREATE TABLE ai_features (
  ai_feature_id INTEGER PRIMARY KEY AUTOINCREMENT,
  appointment_id INTEGER,
  feature_type VARCHAR(50),
  result TEXT,
  created_at DATETIME
);

CREATE TABLE subscriptions (
  subscription_id INTEGER PRIMARY KEY AUTOINCREMENT,
  clinic_id INTEGER,
  plan VARCHAR(50),
  start_date DATE,
  end_date DATE,
  status VARCHAR(50)
);

CREATE TABLE pharmacy_integration (
  integration_id INTEGER PRIMARY KEY AUTOINCREMENT,
  clinic_id INTEGER,
  pharmacy_name VARCHAR(100),
  api_key VARCHAR(255),
  status VARCHAR(50)
);

CREATE TABLE lab_integration (
  integration_id INTEGER PRIMARY KEY AUTOINCREMENT,
  clinic_id INTEGER,
  lab_name VARCHAR(100),
  api_key VARCHAR(255),
  status VARCHAR(50)
);

CREATE TABLE ads (
  ad_id INTEGER PRIMARY KEY AUTOINCREMENT,
  clinic_id INTEGER,
  sponsor VARCHAR(100),
  banner_url VARCHAR(255),
  start_date DATE,
  end_date DATE,
  status VARCHAR(50)
);