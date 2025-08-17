from flask import Flask, request, jsonify, send_file
import os
import uuid
from datetime import datetime
import jwt
from functools import wraps
from werkzeug.security import generate_password_hash, check_password_hash
from flask_cors import CORS
import tensorflow as tf
import numpy as np
from PIL import Image
import io
import sqlite3
import logging
from pathlib import Path
import PIL

# Import ReportLab modules
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize Flask app
app = Flask(__name__)

# Configure CORS
CORS(app, resources={
    r"/api/*": {
        "origins": ["http://localhost:5173", "http://127.0.0.1:5173","http://localhost:5174",
            "http://127.0.0.1:5174"],
        "methods": ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization"]
    }
})

# Load configuration from environment variables
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'your-secret-key-here')  # Change this in production
app.config['DATABASE_PATH'] = os.getenv('DATABASE_PATH', 'database.db')
app.config['UPLOAD_FOLDER'] = os.getenv('UPLOAD_FOLDER', 'uploads')
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size

# Ensure upload directory exists
Path(app.config['UPLOAD_FOLDER']).mkdir(parents=True, exist_ok=True)

# Connect to database
def get_db_connection():
    conn = sqlite3.connect(app.config['DATABASE_PATH'])
    conn.row_factory = sqlite3.Row
    return conn

# Initialize database
def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Users table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT NOT NULL,
        designation TEXT,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_login TEXT
    )
    ''')
    
    # Access requests table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS access_requests (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        reason TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users (id)
    )
    ''')
    
    # Classifications table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS classifications (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        patient_id TEXT NOT NULL,
        patient_name TEXT,
        image_path TEXT NOT NULL,
        classification TEXT NOT NULL,
        confidence REAL NOT NULL,
        notes TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users (id)
    )
    ''')
    
    # Check if admin user exists, if not create one
    cursor.execute("SELECT id FROM users WHERE role = 'admin' LIMIT 1")
    admin = cursor.fetchone()
    
    if not admin:
        admin_id = str(uuid.uuid4())
        now = datetime.now().isoformat()
        hashed_password = generate_password_hash('admin123')
        
        cursor.execute('''
        INSERT INTO users (id, name, email, password, role, designation, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', (admin_id, 'Admin User', 'admin@example.com', hashed_password, 'admin', 'Doctor', 'approved', now))
        
        logger.info("Created default admin user: admin@example.com with password: admin123")
    
    conn.commit()
    conn.close()

# Initialize the database on startup
init_db()

# JWT token verification decorator
def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        
        # Check if token is in headers
        if 'Authorization' in request.headers:
            auth_header = request.headers['Authorization']
            if auth_header.startswith('Bearer '):
                token = auth_header[7:]
        
        if not token:
            return jsonify({'message': 'Token is missing'}), 401
        
        try:
            # Decode the token
            data = jwt.decode(token, app.config['SECRET_KEY'], algorithms=['HS256'])
            
            # Get user from database
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM users WHERE id = ?", (data['id'],))
            current_user = cursor.fetchone()
            conn.close()
            
            if not current_user:
                return jsonify({'message': 'User not found'}), 401
                
            # Convert to dict for easier access
            user_dict = dict(current_user)
            
            # Check if user is approved
            if user_dict['status'] != 'approved':
                return jsonify({'message': 'Account not approved'}), 403
            
        except Exception as e:
            return jsonify({'message': f'Token is invalid: {str(e)}'}), 401
            
        return f(user_dict, *args, **kwargs)
            
    return decorated

# Admin only decorator (must be used after token_required)
def admin_required(f):
    @wraps(f)
    def decorated(current_user, *args, **kwargs):
        if current_user['role'] != 'admin':
            return jsonify({'message': 'Admin privileges required'}), 403
        return f(current_user, *args, **kwargs)
    return decorated

# Update load_model to load multiple models for ensemble learning
models = []
model_weights = []

def load_models():
    try:
        import tensorflow as tf
        import os
        import numpy as np
        
        # Define model paths and their corresponding weights
        model_configs = [
            {
                'path': os.path.join('models', 'ensemble_model_vgg19.h5'),
                'weight': 0.4  # Example weight, should match your training results
            },
            {
                'path': os.path.join('models', 'ensemble_model_inception.h5'),
                'weight': 0.35  # Example weight, should match your training results
            },
            {
                'path': os.path.join('models', 'ensemble_model_mobilenet.h5'),
                'weight': 0.25  # Example weight, should match your training results
            }
        ]
        
        loaded_models = []
        weights = []
        
        for config in model_configs:
            if os.path.exists(config['path']):
                model = tf.keras.models.load_model(config['path'])
                loaded_models.append(model)
                weights.append(config['weight'])
                logger.info(f"Model loaded successfully from {config['path']} with weight {config['weight']}")
            else:
                logger.warning(f"Model file not found: {config['path']}")
        
        if not loaded_models:
            raise Exception("No models were loaded successfully")
            
        # Normalize weights to sum to 1
        total_weight = sum(weights)
        normalized_weights = [w/total_weight for w in weights]
        
        return loaded_models, normalized_weights
    except Exception as e:
        logger.error(f"Error loading models: {str(e)}")
        return None, None

# Load the models at startup
models, model_weights = load_models()

# Authentication routes
@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.json
    
    if not data or not data.get('email') or not data.get('password'):
        return jsonify({'message': 'Email and password are required'}), 400
    
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE email = ?", (data['email'],))
    user = cursor.fetchone()
    
    if not user or not check_password_hash(user['password'], data['password']):
        return jsonify({'message': 'Invalid email or password'}), 401
    
    if user['status'] != 'approved':
        return jsonify({'message': 'Your account is pending approval'}), 403
    
    # Update last login time
    cursor.execute("UPDATE users SET last_login = ? WHERE id = ?", (datetime.now().isoformat(), user['id']))
    conn.commit()
    
    # Create token
    token = jwt.encode({
        'id': user['id'],
        'email': user['email'],
        'exp': datetime.utcnow().timestamp() + 86400  # 24 hours
    }, app.config['SECRET_KEY'], algorithm='HS256')
    
    # Prepare user data
    user_data = {
        'id': user['id'],
        'name': user['name'],
        'email': user['email'],
        'role': user['role'],
        'designation': user['designation'],
        'status': user['status']
    }
    
    conn.close()
    
    return jsonify({'token': token, 'user': user_data}), 200

@app.route('/api/auth/register', methods=['POST'])
def register():
    data = request.json
    
    if not data or not data.get('name') or not data.get('email') or not data.get('password'):
        return jsonify({'message': 'Name, email, and password are required'}), 400
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Check if email already exists
    cursor.execute("SELECT id FROM users WHERE email = ?", (data['email'],))
    if cursor.fetchone():
        conn.close()
        return jsonify({'message': 'Email already registered'}), 400
    
    user_id = str(uuid.uuid4())
    now = datetime.now().isoformat()
    hashed_password = generate_password_hash(data['password'])
    
    # Create user with pending status
    cursor.execute('''
    INSERT INTO users (id, name, email, password, role, designation, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ''', (user_id, data['name'], data['email'], hashed_password, 'user', data['designation'], 'pending', now))
    
    conn.commit()
    conn.close()
    
    return jsonify({'message': 'Registration successful. Your account is pending admin approval.'}), 201

@app.route('/api/auth/request-access', methods=['POST'])
def request_access():
    data = request.json
    
    if not data or not data.get('name') or not data.get('email') or not data.get('password') or not data.get('reason'):
        return jsonify({'message': 'Name, email, password, and reason are required'}), 400
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Check if email already exists
    cursor.execute("SELECT id FROM users WHERE email = ?", (data['email'],))
    if cursor.fetchone():
        conn.close()
        return jsonify({'message': 'Email already registered'}), 400
    
    user_id = str(uuid.uuid4())
    request_id = str(uuid.uuid4())
    now = datetime.now().isoformat()
    hashed_password = generate_password_hash(data['password'])
    
    # Create user with pending status
    cursor.execute('''
    INSERT INTO users (id, name, email, password, role, designation, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ''', (user_id, data['name'], data['email'], hashed_password, 'user', data['designation'], 'pending', now))
    
    # Create access request
    cursor.execute('''
    INSERT INTO access_requests (id, user_id, reason, status, created_at)
    VALUES (?, ?, ?, ?, ?)
    ''', (request_id, user_id, data['reason'], 'pending', now))
    
    conn.commit()
    conn.close()
    
    return jsonify({'message': 'Access request submitted successfully. Your account is pending admin approval.'}), 201

@app.route('/api/auth/user', methods=['GET'])
@token_required
def get_user_data(current_user):
    user_data = {
        'id': current_user['id'],
        'name': current_user['name'],
        'email': current_user['email'],
        'role': current_user['role'],
        'designation': current_user['designation'],
        'status': current_user['status']
    }
    return jsonify(user_data), 200

# Classification routes
@app.route('/api/classification', methods=['POST'])
@token_required
def classify_image(current_user):
    # Check if the post request has the file part
    if 'image' not in request.files:
        return jsonify({'message': 'No image provided'}), 400

    file = request.files['image']

    if file.filename == '':
        return jsonify({'message': 'No selected file'}), 400

    if not file or not allowed_file(file.filename):
        return jsonify({'message': 'File type not allowed'}), 400

    # Get other form data
    patient_id = request.form.get('patientId')
    patient_name = request.form.get('patientName', '')
    notes = request.form.get('notes', '')

    if not patient_id:
        return jsonify({'message': 'Patient ID is required'}), 400

    # Generate a unique filename
    filename = str(uuid.uuid4()) + os.path.splitext(file.filename)[1]
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)

    # Save the file
    try:
        file.save(filepath)
    except Exception as e:
        logger.error(f"Error saving image file: {str(e)}")
        return jsonify({'message': f'Error saving image: {str(e)}'}), 500

    try:
        # Save classification record to database with 'Uploaded' status initially
        conn = get_db_connection()
        cursor = conn.cursor()

        classification_id = str(uuid.uuid4())
        now = datetime.now().isoformat()

        # Insert with 'Uploaded' status, default confidence, and patient_name
        cursor.execute('''
        INSERT INTO classifications (id, user_id, patient_id, patient_name, image_path, classification, confidence, notes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            classification_id,
            current_user['id'],
            patient_id,
            patient_name,
            filepath,
            'Uploaded',  # Initial status is 'Uploaded'
            0.0,         # Default confidence for 'Uploaded'
            notes,
            now
        ))

        conn.commit()
        conn.close()

        # Return the initial record data
        return jsonify({
            'id': classification_id,
            'patientId': patient_id,
            'patientName': patient_name,
            'classification': 'Uploaded', # Explicitly return status as Uploaded
            'confidence': 0.0,
            'createdAt': now,
            'userName': current_user['name'] # Include uploader's name in response
        }), 201

    except Exception as e:
        logger.error(f"Database error during classification upload: {str(e)}")
        # Clean up the saved file if database insertion fails
        if os.path.exists(filepath):
            try:
                os.remove(filepath)
            except Exception as cleanup_e:
                logger.error(f"Error cleaning up file {filepath}: {str(cleanup_e)}")
        return jsonify({'message': f'Error saving classification data: {str(e)}'}), 500

@app.route('/api/classification/<classification_id>', methods=['GET', 'OPTIONS'])
def get_classification(classification_id):
    if request.method == 'OPTIONS':
        return jsonify({}), 204

    # Only apply authentication and permission checks for GET
    @token_required
    def inner(current_user, classification_id):
        # ... existing GET logic ...
        conn = get_db_connection()
        cursor = conn.cursor()

        try:
            # ... existing code ...

            cursor.execute('''
            SELECT c.*, u.name as user_name, u.designation as user_designation
            FROM classifications c
            JOIN users u ON c.user_id = u.id
            WHERE c.id = ?
            ''', (classification_id,))

            classification = cursor.fetchone()

            # ... existing code ...

            user_dict = dict(current_user)
            is_admin = user_dict['role'] == 'admin'
            is_doctor_or_nurse = user_dict.get('designation') in ['Doctor', 'Nurse']
            is_medical_technician = user_dict.get('designation') == 'Medical Technician'
            is_owner = classification['user_id'] == user_dict['id']

            # Corrected permission check:
            # Admin, Doctor, Nurse can view ANY classification.
            # Medical Technicians can ONLY view their OWN classifications.
            if not (is_admin or is_doctor_or_nurse or (is_medical_technician and is_owner)):
                logger.warning(f"User {user_dict['email']} attempted to access classification {classification_id} without permission.")
                return jsonify({'message': 'You do not have permission to view this classification'}), 403

            logger.info(f"Successfully fetched classification for ID: {classification_id}")
            image_url = f"/api/images/{os.path.basename(classification['image_path'])}"

            result = {
                'id': classification['id'],
                'patientId': classification['patient_id'],
                'patientName': classification['patient_name'],
                'classification': classification['classification'],
                'confidence': classification['confidence'],
                'notes': classification['notes'],
                'createdAt': classification['created_at'],
                'imageUrl': image_url,
                'userName': classification['user_name'],
                'userDesignation': classification['user_designation'] # Include uploader's designation
            }

            return jsonify(result), 200

        except jwt.ExpiredSignatureError:
            logger.error('Token has expired')
            return jsonify({'message': 'Token has expired'}), 401
        except jwt.InvalidTokenError:
            logger.error('Invalid token')
            return jsonify({'message': 'Invalid token'}), 401
        except Exception as e:
            logger.error(f"Error during get_classification for ID {classification_id}: {str(e)}")
            return jsonify({'message': f'Error fetching classification: {str(e)}'}), 500
        finally:
            if 'conn' in locals() and conn:
                conn.close()

    return inner(classification_id)

@app.route('/api/classification/history', methods=['GET'])
@token_required
def get_classification_history(current_user):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # For admin, doctor, or nurse, show all classifications. For medical technician, show only their own
    if current_user['role'] == 'admin' or current_user.get('designation') in ['Doctor', 'Nurse']:
        cursor.execute('''
        SELECT c.id, c.patient_id, c.patient_name, c.classification, c.confidence, c.created_at, u.name as user_name
        FROM classifications c
        JOIN users u ON c.user_id = u.id
        ORDER BY c.created_at DESC
        ''')
    elif current_user.get('designation') == 'Medical Technician':
        cursor.execute('''
        SELECT c.id, c.patient_id, c.patient_name, c.classification, c.confidence, c.created_at, u.name as user_name
        FROM classifications c
        JOIN users u ON c.user_id = u.id
        WHERE c.user_id = ?
        ORDER BY c.created_at DESC
        ''', (current_user['id'],))
    else:
        cursor.execute('''
        SELECT c.id, c.patient_id, c.patient_name, c.classification, c.confidence, c.created_at, u.name as user_name
        FROM classifications c
        JOIN users u ON c.user_id = u.id
        WHERE c.user_id = ?
        ORDER BY c.created_at DESC
        ''', (current_user['id'],))
    
    classifications = cursor.fetchall()
    conn.close()
    
    results = []
    for classification in classifications:
        results.append({
            'id': classification['id'],
            'patientId': classification['patient_id'],
            'patientName': classification['patient_name'],
            'classification': classification['classification'],
            'confidence': classification['confidence'],
            'createdAt': classification['created_at'],
            'userName': classification['user_name']
        })
    
    return jsonify(results), 200

@app.route('/api/classification/<classification_id>/report', methods=['GET'])
@token_required
def get_classification_report(current_user, classification_id):
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        cursor.execute('''
        SELECT c.*, u.name as user_name, u.designation as user_designation
        FROM classifications c
        JOIN users u ON c.user_id = u.id
        WHERE c.id = ?
        ''', (classification_id,))

        classification = cursor.fetchone()

        if not classification:
            return jsonify({'message': 'Classification not found'}), 404

        user_dict = dict(current_user)
        is_admin = user_dict['role'] == 'admin'
        is_doctor_or_nurse = user_dict.get('designation') in ['Doctor', 'Nurse']
        is_medical_technician = user_dict.get('designation') == 'Medical Technician'
        is_owner = classification['user_id'] == user_dict['id']
        uploader_designation = classification['user_designation'] if 'user_designation' in classification.keys() else None

        has_permission = False
        if is_admin:
            has_permission = True
        elif is_owner:
             has_permission = True
        elif is_doctor_or_nurse and uploader_designation == 'Medical Technician':
             has_permission = True

        if not has_permission:
            logger.warning(f"User {user_dict['email']} attempted to access report for classification {classification_id} without permission.")
            return jsonify({'message': 'You do not have permission to view this report'}), 403

        # *** ReportLab PDF Generation ***

        # Create a buffer to hold the PDF
        buffer = io.BytesIO()

        # Create the PDF object, using the buffer as its file
        doc = SimpleDocTemplate(buffer, pagesize=letter,
                                topMargin=0.5*inch, bottomMargin=0.5*inch,
                                leftMargin=0.5*inch, rightMargin=0.5*inch)

        # Container for the "flowables" (things that go in the document)
        Story = []

        # Get sample paragraph styles
        styles = getSampleStyleSheet()
        styleN = styles['Normal']
        styleH1 = styles['h1']
        styleH2 = styles['h2']

        # Ensure left alignment for titles
        styleH1.alignment = 0 # 0 means left alignment
        styleH2.alignment = 0 # 0 means left alignment

        # Define a slightly larger font style for table content
        styleTableContent = styles['Normal']
        styleTableContent.fontSize = 11 # Increase font size
        styleTableContent.alignment = 0 # Ensure left alignment for content

        # Add title
        Story.append(Paragraph("ALL Classification Report", styleH1))
        Story.append(Spacer(1, 0.2*inch))

        # --- Add Report Details Table ---
        data = [
            ['Patient ID:', Paragraph(classification['patient_id'], styleTableContent)], # Apply new style
            ['Date:', Paragraph(datetime.fromisoformat(classification['created_at']).strftime('%Y-%m-%d %H:%M:%S'), styleTableContent)], # Apply new style
            ['Classification:', Paragraph(classification['classification'], styleTableContent)], # Apply new style
            ['Confidence:', Paragraph(f"{classification['confidence']:.2f}%", styleTableContent)], # Apply new style
            ['Uploaded By:', Paragraph(classification['user_name'], styleTableContent)], # Apply new style
            ['Notes:', Paragraph(classification['notes'] or 'None', styleTableContent)], # Use Paragraph for notes to handle wrapping, apply new style
        ]

        # Reduced table width
        table = Table(data, colWidths=[1.5*inch, 4.5*inch]) # Adjusted column widths

                # Style the table - removed background colors and conflicting alignments
        table_style = TableStyle([
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'), # Bold for labels in first column
            ('FONTSIZE', (0, 0), (0, -1), 11), # Match increased font size for labels
            ('VALIGN', (0, 0), (-1, -1), 'TOP'), # Align content to top
            # Specific style for notes cell to allow text wrapping
            ('SPAN', (1, 5), (1, 5)), # Span the notes cell across the second column
            # Add padding to all cells
            ('LEFTPADDING', (0, 0), (-1, -1), 6), # Add left padding
            ('RIGHTPADDING', (0, 0), (-1, -1), 6), # Add right padding
            ('TOPPADDING', (0, 0), (-1, -1), 4), # Add top padding
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4), # Add bottom padding
            # Ensure first column is left-aligned
            ('ALIGN', (0, 0), (0, -1), 'LEFT'),
            # No ALIGN directive for the second column or general alignment for all cells here
            # Relying on paragraph style (styleTableContent.alignment = 0) for second column content alignment
        ])

        table.setStyle(table_style)
        Story.append(table)

        # Add space after table
        Story.append(Spacer(1, 0.4*inch))

        # --- Add Blood Sample Image ---
        Story.append(Paragraph("Blood Sample Image:", styleH2))
        Story.append(Spacer(1, 0.2*inch))

        image_path = classification['image_path']
        if os.path.exists(image_path):
            try:
                # Use Pillow to get original image dimensions
                pil_img = PIL.Image.open(image_path)
                img_width, img_height = pil_img.size
                pil_img.close()

                # Create ReportLab Image object
                img = Image(image_path)

                # Calculate scaling to fit image while maintaining aspect ratio
                max_width = 6*inch # Max width for the image in PDF
                max_height = 6*inch # Max height

                aspect_ratio = img_height / img_width

                if img_width > max_width:
                    img_width = max_width
                    img_height = img_width * aspect_ratio

                if img_height > max_height:
                    img_height = max_height
                    img_width = img_height / aspect_ratio

                # Set scaled dimensions on ReportLab Image object
                img.drawWidth = img_width
                img.drawHeight = img_height

                Story.append(img)
            except Exception as img_e:
                logger.error(f"Error adding image {image_path} to PDF: {str(img_e)}")
        else:
            Story.append(Paragraph(f"Image file not found at {image_path}", styleN))
        # -------------------------------------

        # Add footer (similar to the second image)
        Story.append(Spacer(1, 0.3*inch)) # Space before footer
        footer_text = f"Report generated on {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
        # Use Normal style and align center
        styleFooter = styles['Normal']
        styleFooter.alignment = 1 # 1 means center alignment
        Story.append(Paragraph(footer_text, styleFooter))

        # Build the PDF document
        doc.build(Story)

        # Get the value of the BytesIO buffer
        pdf_value = buffer.getvalue()
        buffer.close()

        # Return the PDF
        return pdf_value, 200, {
            'Content-Type': 'application/pdf',
            'Content-Disposition': f'attachment; filename=ALL_Report_{classification_id}.pdf'
        }

    except Exception as e:
        logger.error(f"Error during get_classification_report for ID {classification_id}: {str(e)}")
        return jsonify({'message': f'Error generating report: {str(e)}'}), 500

    finally:
        if 'conn' in locals() and conn:
            conn.close()

@app.route('/api/images/<filename>', methods=['GET'])
@token_required
def get_image(current_user, filename):
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    
    if not os.path.exists(filepath):
        return jsonify({'message': 'Image not found'}), 404
    
    # Security check - verify the user has access to this image
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute('''
    SELECT user_id FROM classifications
    WHERE image_path LIKE ?
    ''', (f'%{filename}',))
    
    image_owner = cursor.fetchone()
    conn.close()
    
    if not image_owner:
        return jsonify({'message': 'Image not found in database'}), 404
    
    if current_user['role'] != 'admin' and image_owner['user_id'] != current_user['id']:
        return jsonify({'message': 'You do not have permission to view this image'}), 403
    
    return send_file(filepath)

# Dashboard routes
@app.route('/api/dashboard/statistics', methods=['GET'])
@token_required
def get_dashboard_statistics(current_user):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Get total classifications
    # Always count all classifications regardless of user role/designation
    cursor.execute("SELECT COUNT(*) FROM classifications")
    
    total_classifications = cursor.fetchone()[0]
    
    # Get recent classifications
    # For admin, doctor, or nurse, show all recent classifications. For medical technician, show only their own
    if current_user['role'] == 'admin' or current_user.get('designation') in ['Doctor', 'Nurse']:
        cursor.execute("""
        SELECT c.id, c.patient_id, c.classification, c.confidence, c.created_at
        FROM classifications c
        ORDER BY c.created_at DESC
        LIMIT 5
        """)
    else:
        cursor.execute("""
        SELECT c.id, c.patient_id, c.classification, c.confidence, c.created_at
        FROM classifications c
        WHERE c.user_id = ?
        ORDER BY c.created_at DESC
        LIMIT 5
        """, (current_user['id'],))
    
    recent_classifications = []
    for row in cursor.fetchall():
        recent_classifications.append({
            'id': row['id'],
            'patientId': row['patient_id'],
            'classification': row['classification'],
            'confidence': row['confidence'],
            'createdAt': row['created_at']
        })
    
    # Get classification types distribution
    # Always get distribution across all classifications
    cursor.execute("""
    SELECT classification, COUNT(*) as count
    FROM classifications
    GROUP BY classification
    ORDER BY count DESC
    """)
    
    classification_types = []
    total_count = 0
    
    for row in cursor.fetchall():
        classification_types.append({
            'type': row['classification'],
            'count': row['count'],
            'percentage': 0  # Will calculate after getting total
        })
        total_count += row['count']
    
    # Calculate percentages
    for type_info in classification_types:
        type_info['percentage'] = (type_info['count'] / total_count * 100) if total_count > 0 else 0
    
    # Get average confidence
    # Always calculate average confidence across all classifications
    cursor.execute("SELECT AVG(confidence) FROM classifications")
    
    avg_result = cursor.fetchone()
    average_confidence = avg_result[0] if avg_result[0] is not None else 0
    
    conn.close()
    
    return jsonify({
        'totalClassifications': total_classifications,
        'recentClassifications': recent_classifications,
        'classificationsByType': classification_types,
        'averageConfidence': average_confidence
    }), 200

# Admin routes
@app.route('/api/admin/statistics', methods=['GET'])
@token_required
@admin_required
def get_admin_statistics(current_user):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Get total users
    cursor.execute("SELECT COUNT(*) FROM users")
    total_users = cursor.fetchone()[0]
    
    # Get approved users
    cursor.execute("SELECT COUNT(*) FROM users WHERE status = 'approved'")
    approved_users = cursor.fetchone()[0]
    
    # Get pending requests
    cursor.execute("SELECT COUNT(*) FROM access_requests WHERE status = 'pending'")
    pending_requests = cursor.fetchone()[0]
    
    # Get total classifications
    cursor.execute("SELECT COUNT(*) FROM classifications")
    total_classifications = cursor.fetchone()[0]
    
    # Get recent activity
    cursor.execute("""
    SELECT 'user_approved' as type, u.id as user_id, u.name as user_name, 
           'User was approved' as details, u.created_at as timestamp
    FROM users u
    WHERE u.status = 'approved' AND u.role = 'user'
    
    UNION ALL
    
    SELECT 'user_registered' as type, u.id as user_id, u.name as user_name,
           'User registered' as details, u.created_at as timestamp
    FROM users u
    
    UNION ALL
    
    SELECT 'classification_created' as type, u.id as user_id, u.name as user_name,
           'Created a new classification' as details, c.created_at as timestamp
    FROM classifications c
    JOIN users u ON c.user_id = u.id
    
    ORDER BY timestamp DESC
    LIMIT 10
    """)
    
    recent_activity = []
    for row in cursor.fetchall():
        recent_activity.append({
            'id': str(uuid.uuid4()),  # Generate a unique ID for the activity
            'type': row['type'],
            'userId': row['user_id'],
            'userName': row['user_name'],
            'details': row['details'],
            'timestamp': row['timestamp']
        })
    
    conn.close()
    
    return jsonify({
        'totalUsers': total_users,
        'approvedUsers': approved_users,
        'pendingRequests': pending_requests,
        'totalClassifications': total_classifications,
        'recentActivity': recent_activity
    }), 200

@app.route('/api/admin/users', methods=['GET'])
@token_required
@admin_required
def get_all_users(current_user):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM users ORDER BY created_at DESC")
    users = cursor.fetchall()
    
    conn.close()
    
    user_list = []
    for user in users:
        user_list.append({
            'id': user['id'],
            'name': user['name'],
            'email': user['email'],
            'role': user['role'],
            'designation': user['designation'],
            'status': user['status'],
            'createdAt': user['created_at'],
            'lastLogin': user['last_login']
        })
    
    return jsonify(user_list), 200

@app.route('/api/admin/users/<user_id>', methods=['DELETE'])
@token_required
@admin_required
def delete_user(current_user, user_id):
    # Prevent deleting the current admin user
    if user_id == current_user['id']:
        return jsonify({'message': 'You cannot delete your own account'}), 400
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Get user info for validation
    cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
    user = cursor.fetchone()
    
    if not user:
        conn.close()
        return jsonify({'message': 'User not found'}), 404
    
    # Delete related access requests
    cursor.execute("DELETE FROM access_requests WHERE user_id = ?", (user_id,))
    
    # Update classifications to set user_id to the current admin
    cursor.execute("UPDATE classifications SET user_id = ? WHERE user_id = ?", (current_user['id'], user_id))
    
    # Delete the user
    cursor.execute("DELETE FROM users WHERE id = ?", (user_id,))
    
    conn.commit()
    conn.close()
    
    return jsonify({'message': 'User deleted successfully'}), 200

@app.route('/api/admin/users/<user_id>/status', methods=['PATCH'])
@token_required
@admin_required
def update_user_status(current_user, user_id):
    data = request.json
    
    if not data or 'status' not in data:
        return jsonify({'message': 'Status is required'}), 400
    
    if data['status'] not in ['approved', 'suspended', 'pending']:
        return jsonify({'message': 'Invalid status value'}), 400
    
    # Prevent changing own status
    if user_id == current_user['id']:
        return jsonify({'message': 'You cannot change your own status'}), 400
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Check if user exists
    cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
    user = cursor.fetchone()
    
    if not user:
        conn.close()
        return jsonify({'message': 'User not found'}), 404
    
    # Update user status
    cursor.execute("UPDATE users SET status = ? WHERE id = ?", (data['status'], user_id))
    
    # If approving a user, update any pending access requests
    if data['status'] == 'approved':
        cursor.execute("UPDATE access_requests SET status = 'approved' WHERE user_id = ? AND status = 'pending'", (user_id,))
    
    conn.commit()
    conn.close()
    
    return jsonify({'message': f"User status updated to {data['status']}"}), 200

@app.route('/api/admin/users/<user_id>/role', methods=['PATCH'])
@token_required
@admin_required
def update_user_role(current_user, user_id):
    data = request.json
    
    if not data or 'role' not in data:
        return jsonify({'message': 'Role is required'}), 400
    
    if data['role'] not in ['admin', 'user']:
        return jsonify({'message': 'Invalid role value'}), 400
    
    # Prevent changing own role
    if user_id == current_user['id']:
        return jsonify({'message': 'You cannot change your own role'}), 400
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Check if user exists
    cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
    user = cursor.fetchone()
    
    if not user:
        conn.close()
        return jsonify({'message': 'User not found'}), 404
    
    # Update user role
    cursor.execute("UPDATE users SET role = ? WHERE id = ?", (data['role'], user_id))
    
    conn.commit()
    conn.close()
    
    return jsonify({'message': f"User role updated to {data['role']}"}), 200

@app.route('/api/admin/access-requests', methods=['GET'])
@token_required
@admin_required
def get_access_requests(current_user):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("""
    SELECT ar.id, ar.user_id, u.name as user_name, u.email, ar.reason, ar.created_at
    FROM access_requests ar
    JOIN users u ON ar.user_id = u.id
    WHERE ar.status = 'pending'
    ORDER BY ar.created_at DESC
    """)
    
    requests = cursor.fetchall()
    conn.close()
    
    request_list = []
    for req in requests:
        request_list.append({
            'id': req['id'],
            'userId': req['user_id'],
            'userName': req['user_name'],
            'email': req['email'],
            'reason': req['reason'],
            'createdAt': req['created_at']
        })
    
    return jsonify(request_list), 200

@app.route('/api/admin/access-requests/<request_id>', methods=['PATCH'])
@token_required
@admin_required
def update_access_request(current_user, request_id):
    try:
        data = request.json
        logger.info(f"Received access request update: {data}")
        
        if not data or 'status' not in data:
            logger.error("Status is missing from request data")
            return jsonify({'message': 'Status is required'}), 400
        
        if data['status'] not in ['approved', 'denied']:
            logger.error(f"Invalid status value: {data['status']}")
            return jsonify({'message': 'Invalid status value'}), 400
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Check if request exists
        cursor.execute("SELECT * FROM access_requests WHERE id = ?", (request_id,))
        access_request = cursor.fetchone()
        
        if not access_request:
            logger.error(f"Access request not found: {request_id}")
            conn.close()
            return jsonify({'message': 'Access request not found'}), 404
        
        # Update request status
        cursor.execute("UPDATE access_requests SET status = ? WHERE id = ?", (data['status'], request_id))
        
        # Update user status accordingly
        user_id = access_request['user_id']
        user_status = 'approved' if data['status'] == 'approved' else 'denied'
        cursor.execute("UPDATE users SET status = ? WHERE id = ?", (user_status, user_id))
        
        conn.commit()
        conn.close()
        
        logger.info(f"Successfully updated access request {request_id} to {data['status']}")
        return jsonify({'message': f"Access request {data['status']}"}), 200
        
    except Exception as e:
        logger.error(f"Error updating access request: {str(e)}")
        return jsonify({'message': f'Error processing request: {str(e)}'}), 500

# Helper functions
def allowed_file(filename):
    allowed_extensions = {'png', 'jpg', 'jpeg', 'gif'}
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in allowed_extensions

# Update classify_blood_sample to use weighted ensemble learning
def classify_blood_sample(image_path):
    try:
        import numpy as np
        from PIL import Image
        import tensorflow as tf
        
        # Load and preprocess the image
        img = Image.open(image_path).convert('RGB')
        img = img.resize((224, 224))  # Adjust if your model expects a different size
        img_array = np.array(img) / 255.0  # Normalize to [0, 1]
        img_array = np.expand_dims(img_array, axis=0)  # Add batch dimension

        if not models or not model_weights:
            raise Exception("Models or weights are not loaded properly.")

        # Get weighted predictions from all models
        weighted_predictions = []
        for model, weight in zip(models, model_weights):
            prediction = model.predict(img_array, verbose=0)
            weighted_predictions.append(prediction[0] * weight)  # Remove batch dimension and apply weight

        # Sum up weighted predictions
        ensemble_prediction = np.sum(weighted_predictions, axis=0)
        
        # Get final class and confidence
        final_class_idx = np.argmax(ensemble_prediction)
        ensemble_confidence = float(ensemble_prediction[final_class_idx]) * 100

        # Map class index to class name
        class_names = [
            "Benign",
            "Early",
            "Pre",
            "Pro"
        ]
        
        if final_class_idx < len(class_names):
            classification = class_names[final_class_idx]
        else:
            classification = f"Class {final_class_idx}"

        # Log individual model predictions and weights for debugging
        logger.info(f"Model weights: {model_weights}")
        logger.info(f"Ensemble prediction: {classification} with confidence {ensemble_confidence:.2f}%")

        return classification, ensemble_confidence
    except Exception as e:
        logger.error(f"Error in classification: {str(e)}")
        raise Exception(f"Classification error: {str(e)}")

# Add a test PATCH endpoint for CORS troubleshooting
@app.route('/api/test-patch', methods=['PATCH', 'OPTIONS'])
def test_patch():
    if request.method == 'OPTIONS':
        logger.info('Received OPTIONS preflight for /api/test-patch')
        return '', 204
    logger.info('Received PATCH request for /api/test-patch')
    return jsonify({'message': 'PATCH works!'}), 200

@app.route('/api/classifications/search', methods=['GET'])
@token_required
def search_classifications(current_user):
    patient_id = request.args.get('patientId')
    patient_name = request.args.get('patientName')

    conn = get_db_connection()
    cursor = conn.cursor()

    query = '''
        SELECT c.*, u.name as user_name, u.designation as user_designation
        FROM classifications c
        JOIN users u ON c.user_id = u.id
        WHERE 1=1
    '''
    params = []

    if patient_id:
        query += ' AND c.patient_id LIKE ?'
        params.append(f'%{patient_id}%')
    if patient_name:
        query += ' AND c.patient_name LIKE ?'
        params.append(f'%{patient_name}%')
        
    # Add conditions to only search classifications created by medical technicians for doctors/nurses
    # and only their own for medical technicians
    if current_user.get('designation') in ['Doctor', 'Nurse']:
        # Doctors/Nurses can search all classifications uploaded by Medical Technicians
        query += ' AND u.designation = ?'
        params.append('Medical Technician')
    elif current_user.get('designation') == 'Medical Technician':
        # Medical Technicians can only search their own classifications
        query += ' AND c.user_id = ?'
        params.append(current_user['id'])
    # Other roles see no results unless they search their own (not implemented here)
    # If you want other roles to search their own, add an 'else' clause here

    query += ' ORDER BY c.created_at DESC' # Add ordering

    cursor.execute(query, params)
    results = cursor.fetchall()
    conn.close()

    response = []
    for row in results:
        response.append({
            'id': row['id'],
            'patientId': row['patient_id'],
            'patientName': row['patient_name'],
            'classification': row['classification'],
            'confidence': row['confidence'],
            'createdAt': row['created_at'],
            'userName': row['user_name'],
            'notes': row['notes'] # Include notes in search results
        })

    return jsonify(response), 200

@app.route('/api/classification/<classification_id>/classify', methods=['POST'])
@token_required
def reclassify_image(current_user, classification_id):
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        # Retrieve the classification record
        cursor.execute("SELECT * FROM classifications WHERE id = ?", (classification_id,))
        classification = cursor.fetchone()

        if not classification:
            conn.close()
            return jsonify({'message': 'Classification record not found'}), 404

        # Check if the user is allowed to classify this image
        # Admin, Doctor, Nurse can classify. Medical Technicians can only classify their own uploads.
        user_dict = dict(current_user)
        is_admin = user_dict['role'] == 'admin'
        is_doctor_or_nurse = user_dict.get('designation') in ['Doctor', 'Nurse']
        is_medical_technician = user_dict.get('designation') == 'Medical Technician'
        is_owner = classification['user_id'] == user_dict['id']

        if not (is_admin or is_doctor_or_nurse or (is_medical_technician and is_owner)):
             conn.close()
             return jsonify({'message': 'You do not have permission to perform classification on this record'}), 403

        # Get the image path
        image_path = classification['image_path']

        if not os.path.exists(image_path):
            conn.close()
            return jsonify({'message': 'Image file not found on server'}), 404

        # Perform classification
        logger.info(f"Attempting to classify image: {image_path} for record ID: {classification_id}")
        classification_result, confidence = classify_blood_sample(image_path)
        logger.info(f"Classification result for {classification_id}: {classification_result} with confidence {confidence}")

        # Update the database record
        cursor.execute('''
        UPDATE classifications
        SET classification = ?, confidence = ?
        WHERE id = ?
        ''', (classification_result, confidence, classification_id))

        conn.commit()

        # Fetch the updated record to return
        cursor.execute("SELECT c.*, u.name as user_name FROM classifications c JOIN users u ON c.user_id = u.id WHERE c.id = ?", (classification_id,))
        updated_classification = cursor.fetchone()

        response_data = {
            'id': updated_classification['id'],
            'patientId': updated_classification['patient_id'],
            'patientName': '', # Patient name not stored directly here
            'classification': updated_classification['classification'],
            'confidence': updated_classification['confidence'],
            'createdAt': updated_classification['created_at'],
            'userName': updated_classification['user_name'],
             'imageUrl': f"/api/images/{os.path.basename(updated_classification['image_path'])}" # Include image URL
        }

        return jsonify(response_data), 200

    except Exception as e:
        logger.error(f"Error during reclassification for {classification_id}: {str(e)}")
        conn.rollback() # Rollback changes if something goes wrong
        return jsonify({'message': f'Failed to perform classification: {str(e)}'}), 500

    finally:
        conn.close()

if __name__ == '__main__':
    app.run(debug=True)