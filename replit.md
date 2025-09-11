# Overview

This is a full-stack Express.js application for social media management and API monitoring. The application features a React frontend built with TypeScript and a Node.js backend using Express. It includes a comprehensive dashboard for monitoring API routes, managing social media accounts, and tracking server performance. The application is designed to handle social media posting across multiple platforms (X/Twitter, Facebook, Instagram) with OAuth authentication and real-time monitoring capabilities.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture
- **Framework**: React with TypeScript and Vite for fast development and building
- **Routing**: Wouter for lightweight client-side routing
- **State Management**: TanStack Query (React Query) for server state management and data fetching
- **UI Components**: Radix UI components with shadcn/ui design system for consistent, accessible interface
- **Styling**: Tailwind CSS with custom design tokens and dark theme support
- **Form Handling**: React Hook Form with Zod validation for type-safe form management

## Backend Architecture
- **Framework**: Express.js with TypeScript for type safety
- **Database**: PostgreSQL with Drizzle ORM for type-safe database operations
- **Schema Management**: Shared schema definitions between frontend and backend using Drizzle and Zod
- **API Design**: RESTful API with structured error handling and request/response logging
- **Storage Layer**: Abstracted storage interface with both database and in-memory implementations
- **Development Environment**: Hot module replacement with Vite integration for seamless development

## Data Storage Solutions
- **Primary Database**: PostgreSQL for production data persistence
- **ORM**: Drizzle ORM providing type-safe database queries and migrations
- **Schema Definition**: Centralized schema in `/shared` directory defining:
  - Users table for authentication
  - Social accounts table for OAuth tokens and platform connections
  - Posts table for tracking social media content
  - API logs table for monitoring and analytics
- **Development Storage**: In-memory storage implementation for testing and development

## Authentication and Authorization
- **OAuth 2.0 PKCE Flow**: Simplified OAuth 2.0 implementation with PKCE (Proof Key for Code Exchange) for secure authentication
- **Direct Redirects**: Clean user experience with direct redirects to Twitter authorization instead of JSON responses
- **Token Management**: Secure storage of access tokens, refresh tokens, and expiration tracking via storage interface
- **In-Memory State**: PKCE code verifiers stored temporarily in memory with automatic cleanup
- **Session Handling**: Express session management with PostgreSQL session store
- **CORS Configuration**: Configurable CORS settings for cross-origin requests

# External Dependencies

## Database Services
- **Neon Database**: Serverless PostgreSQL hosting (@neondatabase/serverless)
- **Session Store**: PostgreSQL-backed session storage (connect-pg-simple)

## UI and Design
- **Component Library**: Radix UI primitives for accessible, unstyled components
- **Icons**: Lucide React for consistent iconography
- **Fonts**: Google Fonts integration (Inter, Fira Code, Architects Daughter, DM Sans, Geist Mono)

## Development Tools
- **Build System**: Vite with React plugin and ESBuild for production builds
- **Development Features**: Replit integration with runtime error overlay and cartographer
- **Code Quality**: TypeScript for type safety across the entire application

## Social Media APIs
- **X/Twitter API**: OAuth authentication and posting capabilities
- **Facebook API**: Graph API integration for Facebook posting
- **Instagram API**: Business API for Instagram content management

## Utility Libraries
- **Date Handling**: date-fns for date manipulation and formatting
- **HTTP Client**: Built-in fetch with custom query client configuration
- **Validation**: Zod for runtime type validation and schema generation
- **CSS**: Tailwind CSS with PostCSS and Autoprefixer for styling

The application follows a monorepo structure with clear separation between client, server, and shared code, enabling type safety and code reuse across the full stack.