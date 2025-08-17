# Acute Lymphoblastic Leukemia (ALL) Classification System

A web-based system for classifying acute lymphoblastic leukemia (ALL) subtypes from blood sample images using machine learning models.

## Features

- Secure authentication system with admin approval workflow
- Integration with pre-trained ML models for image classification
- Image upload functionality with patient information tracking
- Detailed classification results with confidence scores
- Classification history and reporting capabilities
- Admin dashboard for managing user access requests and permissions
- Responsive design optimized for clinical settings

## Technology Stack

- **Frontend**: React, TypeScript, TailwindCSS
- **Backend**: Python, Flask, SQLite
- **ML Integration**: TensorFlow
- **Authentication**: JWT-based authentication

## Getting Started

### Prerequisites

- Node.js (v16+)
- Python (v3.8+)
- pip

### Installation

1. Clone the repository
2. Install frontend dependencies:
   ```
   npm install
   ```
3. Install backend dependencies:
   ```
   cd backend
   pip install -r requirements.txt
   ```

### Running the Application

1. Start the backend server:
   ```
   cd backend
   python app.py
   ```

2. Start the frontend development server:
   ```
   npm run dev
   ```

3. Open your browser and navigate to `http://localhost:5173`

### Default Admin Account

- Email: admin@example.com
- Password: admin123

## Project Structure

- `/src` - React frontend code
- `/backend` - Python Flask backend code
- `/backend/uploads` - Storage for uploaded images
- `/public` - Public assets

## Usage

1. Login or request access to the system
2. Upload blood sample images
3. View classification results
4. Access history and generate reports

## License

This project is licensed under the MIT License.