# Fix Authentication, Site Selection, Employee Validation, UI, and Error Messages

This plan addresses all the requested fixes for the mobile application.

## User Review Required
None of these changes are breaking, but please confirm the understanding of the Supervisor Profile logic.

## Open Questions
- For the Supervisor profile change: I plan to remove the "Sign Out" button from the main `ProfileScreen` shared by all roles, and add the missing "Notification Bell" (Alerts) so that the profile page is consistent for all users. The dashboard will retain its top header. Does this align with your requirement?

## Proposed Changes

### 1. Password Authentication
The login screen currently has hardcoded credentials that bypass proper password checking.
#### [MODIFY] [LoginScreen.tsx](file:///C:/Imposter/src/screens/auth/LoginScreen.tsx)
- Remove `'ADMIN001'` default username and `'password'` default password in state initialization.
- Retain the validation logic that ensures the user types in their actual credentials.

### 2. Multi-site Filtering for Checking In
The `CheckInScreen` currently lists all possible sites from the backend instead of just the ones assigned to the employee.
#### [MODIFY] [CheckInScreen.tsx](file:///C:/Imposter/src/screens/technician/CheckInScreen.tsx)
- Add client-side filtering after calling `siteService.getSites()`.
- Filter the fetched sites so that only sites that match `user.assignedSiteId` or are present in the `user.assignedSiteIds` array are available to be selected for check-in.

### 3. Duplicate Employee ID Validation (Registration)
The `EmployeesScreen` allows creating users with an already existing Employee ID.
#### [MODIFY] [EmployeesScreen.tsx](file:///C:/Imposter/src/screens/admin/EmployeesScreen.tsx)
- Inside the `handleSaveEmployee` function, iterate through the loaded `employees` array.
- Show a friendly `Alert.alert` if the entered `employeeId` matches an existing record (ignoring the current record being edited, if applicable).

### 4. Supervisor Profile Page consistency & Sign Out Removal
Make the profile screen UI consistent and remove the sign out functionality.
#### [MODIFY] [ProfileScreen.tsx](file:///C:/Imposter/src/screens/common/ProfileScreen.tsx)
- Remove the "Sign Out of Platform" button at the bottom of the scroll view.
- Add a Notification Bell icon (similar to what exists in the Dashboard) next to the menu icon in the top header.

### 5. Appropriate User-Friendly Error Messages
Raw API error strings or stack traces are leaking into user-facing alerts.
#### [MODIFY] [api.ts](file:///C:/Imposter/src/services/api.ts)
- Implement a utility function `getFriendlyErrorMessage(err)` that extracts and normalizes errors (e.g., transforming "Network Error" or "400 Bad Request" details into clean, non-technical statements).
#### [MODIFY] Several Screens (`LoginScreen.tsx`, `EmployeesScreen.tsx`, `CheckInScreen.tsx`, etc.)
- Use the utility to sanitize error outputs in `Alert.alert` instead of printing `err.response?.data?.detail` or `err.message` directly.

## Verification Plan
### Automated Tests
- Typecheck the project using `npx tsc --noEmit` to ensure type consistency after modifications.
### Manual Verification
- Attempt logging in with empty credentials to ensure password validation blocks it.
- Attempt creating a duplicate employee ID in the Admin panel to see the new validation error block.
- Open the profile page to confirm the Sign Out button is gone and the Notification Bell is visible.
- Log in as a technician and verify that the Check-In screen only shows the assigned site(s).