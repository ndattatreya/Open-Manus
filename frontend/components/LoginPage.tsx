import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { ShiningStars } from './ShiningStars';
import { authAPI, setAuthToken, setAuthUser } from '../lib/api';
import {
  signInWithGoogle,
  signInWithMicrosoft,
  signInWithApple,
  initGoogleOAuth
} from '../lib/oauth';

interface LoginPageProps {
  onLogin: () => void;
  onNavigateToSignUp: () => void;
}

export function LoginPage({ onLogin, onNavigateToSignUp }: LoginPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(false);

  // Initialize Google OAuth on component mount
  useEffect(() => {
    initGoogleOAuth().catch(err => {
      console.log('Google OAuth not configured:', err.message);
    });
  }, []);

  // ------------------- HANDLE OAUTH LOGIN -------------------
  const handleOAuthLogin = async (provider: 'google' | 'microsoft' | 'apple') => {
    setError('');
    setLoading(true);

    try {
      let userData;

      switch (provider) {
        case 'google':
          userData = await signInWithGoogle();
          break;
        case 'microsoft':
          userData = await signInWithMicrosoft();
          break;
        case 'apple':
          userData = await signInWithApple();
          break;
        default:
          throw new Error('Invalid provider');
      }

      // Send OAuth data to backend
      const response = await authAPI.oauthLogin(provider, userData);

      if (response.success) {
        setAuthToken(response.data.token);
        setAuthUser(response.data.user);

        // ✅ Store username for later use
        if (response.data.user?.name || response.data.user?.username) {
          const username = response.data.user.name || response.data.user.username;
          localStorage.setItem('username', username);
        }

        onLogin();
      }
    } catch (err: any) {
      console.error(`${provider} login error:`, err);

      let errorMessage = err.message;
      if (errorMessage.includes('not configured') || errorMessage.includes('client_id')) {
        errorMessage = `${provider.charAt(0).toUpperCase() + provider.slice(1)} sign-in is not configured yet. Please use email/password login or contact support.`;
      }

      setError(errorMessage || `Failed to sign in with ${provider}. Please try again.`);
    } finally {
      setLoading(false);
    }
  };

  // ------------------- HANDLE EMAIL LOGIN -------------------
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    localStorage.setItem('email', email);

    try {
      const response = await authAPI.login({ email, password });

      if (response.success) {
        // Store token and user data
        setAuthToken(response.data.token);
        setAuthUser(response.data.user);

        // Call onLogin to update app state
        onLogin();
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Login failed. Please try again.');
      console.error('Login error:', err);
    } finally {
      setLoading(false);
    }
  };

  // ------------------- UI -------------------
  return (
    <div className="min-h-screen bg-black relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-900/60 via-black/40 to-blue-900/60 z-10" />
        <div className="absolute inset-0 z-0">
          <div className="absolute top-20 left-20 w-72 h-72 bg-purple-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '4s' }} />
          <div className="absolute top-40 right-32 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '6s', animationDelay: '2s' }} />
          <div className="absolute bottom-32 left-32 w-80 h-80 bg-pink-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '5s', animationDelay: '1s' }} />
          <div className="absolute bottom-20 right-20 w-64 h-64 bg-indigo-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '7s', animationDelay: '3s' }} />
        </div>
      </div>

      {/* Nava AI Logo */}
      <div className="absolute top-6 left-6 z-20">
        <div className="flex items-center space-x-3">
          <ShiningStars size="small" count={15} />
          <span className="text-white">Nava AI</span>
        </div>
      </div>

      {/* Login Card */}
      <div className="flex items-center justify-center min-h-screen p-4 relative z-20">
        <div className="w-full max-w-sm">
          <div className="backdrop-blur-xl bg-white/10 rounded-2xl p-6 shadow-2xl">
            <div className="flex justify-center mb-2">
              <ShiningStars size="medium" count={20} />
            </div>

            <div className="text-center mb-3">
              <h1 className="text-white text-xl mb-1">Sign in to Nava AI</h1>
              <p className="text-gray-300 text-sm">No waitlist—start creating now</p>
            </div>

            {error && (
              <div className="mb-4 bg-red-500/20 border border-red-500/50 text-red-200 px-4 py-3 rounded-xl text-sm">
                {error}
              </div>
            )}

            {/* OAuth Buttons */}
            <div className="space-y-2 mb-4">
              <Button
                onClick={() => handleOAuthLogin('google')}
                disabled={loading}
                className="w-full bg-white/10 hover:bg-white/20 text-white rounded-xl py-2 text-sm transition-all duration-200 backdrop-blur-sm disabled:opacity-50"
                variant="outline"
              >
                <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Sign in with Google
              </Button>

              <Button
                onClick={() => handleOAuthLogin('microsoft')}
                disabled={loading}
                className="w-full bg-white/10 hover:bg-white/20 text-white rounded-xl py-2 text-sm transition-all duration-200 backdrop-blur-sm disabled:opacity-50"
                variant="outline"
              >
                <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24">
                  <path fill="#00A4EF" d="M0 0h11.377v11.372H0z" />
                  <path fill="#FFB900" d="M12.623 0H24v11.372H12.623z" />
                  <path fill="#00BCF2" d="M0 12.628h11.377V24H0z" />
                  <path fill="#00D427" d="M12.623 12.628H24V24H12.623z" />
                </svg>
                Sign in with Microsoft
              </Button>

              <Button
                onClick={() => handleOAuthLogin('apple')}
                disabled={loading}
                className="w-full bg-white/10 hover:bg-white/20 text-white rounded-xl py-2 text-sm transition-all duration-200 backdrop-blur-sm disabled:opacity-50"
                variant="outline"
              >
                <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24">
                  <path fill="#FFFFFF" d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
                </svg>
                Sign in with Apple
              </Button>
            </div>

            {/* OR divider */}
            <div className="flex items-center mb-4">
              <div className="flex-1 h-px bg-white/20"></div>
              <span className="px-3 text-gray-400 text-sm">OR</span>
              <div className="flex-1 h-px bg-white/20"></div>
            </div>

            {!showEmailForm ? (
              <Button
                onClick={() => setShowEmailForm(true)}
                className="w-full bg-white text-black hover:bg-gray-100 rounded-xl py-2 text-sm transition-all duration-200"
              >
                Continue with Email
              </Button>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-white text-sm">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    required
                    className="bg-white/10 border-white/20 text-white placeholder:text-gray-400 rounded-xl focus:border-white/40"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password" className="text-white text-sm">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    minLength={6}
                    className="bg-white/10 border-white/20 text-white placeholder:text-gray-400 rounded-xl focus:border-white/40"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-white text-black hover:bg-gray-100 rounded-xl py-2 text-sm transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Signing in...' : 'Sign in'}
                </Button>

                <Button
                  type="button"
                  onClick={() => setShowEmailForm(false)}
                  variant="ghost"
                  className="w-full text-white hover:bg-white/10 rounded-xl py-2 text-sm transition-all duration-200"
                >
                  Back to social login
                </Button>
              </form>
            )}

            {/* Footer */}
            <div className="mt-6 text-center space-y-3">
              <p className="text-gray-400 text-sm">
                Don't have an account?{' '}
                <button onClick={onNavigateToSignUp} className="text-white hover:underline">Sign up</button>
              </p>
              <div className="flex justify-center space-x-3 text-xs text-gray-500">
                <button className="hover:text-gray-300 transition-colors">Terms of Service</button>
                <span>|</span>
                <button className="hover:text-gray-300 transition-colors">Privacy Policy</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
