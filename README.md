# Backend - Web Wizard Chat

This is the backend server for the Web Wizard real-time chat application.

## Quick Start

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create `.env` file:
   ```env
   PORT=5000
   MONGODB_URI=mongodb://localhost:27017/webwizard
   JWT_SECRET=your_super_secret_jwt_key_here
   FRONTEND_URL=http://localhost:3000
   ```

3. Start development server:
   ```bash
   npm run dev
   ```

## Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build TypeScript to JavaScript
- `npm start` - Start production server

## Dependencies

- **express** - Web framework
- **socket.io** - Real-time communication
- **mongoose** - MongoDB object modeling
- **jsonwebtoken** - JWT token handling
- **bcryptjs** - Password hashing
- **cors** - Cross-origin resource sharing
- **dotenv** - Environment variable loading