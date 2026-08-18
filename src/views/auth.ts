/** Sign in and register. The only screen that works without a session. */
import * as api from '../api.js'
import { field, input } from '../components.js'
import { busy, button, clear, el, toast } from '../dom.js'

export function renderSignIn(root: HTMLElement, onSignedIn: () => void): void {
  let mode: 'login' | 'register' = 'login'

  const draw = () => {
    clear(root)

    const email = input('email', { placeholder: 'you@example.com', autocomplete: 'email', required: true })
    const password = input('password', {
      placeholder: mode === 'register' ? 'At least 10 characters' : 'Your password',
      autocomplete: mode === 'register' ? 'new-password' : 'current-password',
      required: true,
    })
    const displayName = input('text', { placeholder: 'What people see', maxlength: 60 })

    const submit = el('button', {
      class: 'primary wide',
      type: 'submit',
      text: mode === 'login' ? 'Sign in' : 'Create account',
    })

    const form = el('form', { class: 'auth-form' }, [
      field('Email', email),
      field('Password', password, mode === 'register' ? 'Length beats punctuation. Ten characters minimum.' : undefined),
      mode === 'register' ? field('Display name', displayName) : null,
      submit,
    ])

    form.addEventListener('submit', (event) => {
      event.preventDefault()
      void busy(submit, async () => {
        try {
          if (mode === 'login') {
            await api.login(email.value.trim(), password.value)
          } else {
            await api.register(email.value.trim(), password.value, displayName.value.trim() || undefined)
          }
          onSignedIn()
        } catch (error) {
          toast(error instanceof Error ? error.message : 'Could not sign in', 'error')
        }
      })
    })

    const swap = button(
      mode === 'login' ? 'No account? Create one' : 'Already have an account? Sign in',
      () => {
        mode = mode === 'login' ? 'register' : 'login'
        draw()
      },
      'link-button',
    )

    root.append(
      el('div', { class: 'auth-card' }, [
        el('div', { class: 'auth-brand' }, [
          el('span', { class: 'brand-mark', 'aria-hidden': 'true', text: '🎞️' }),
          el('h1', { text: 'MovieTracker' }),
          el('p', { class: 'tagline', text: 'Everything you have watched, and everything you mean to.' }),
        ]),
        form,
        swap,
      ]),
    )
  }

  draw()
}
