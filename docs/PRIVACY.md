# Privacy and data lifecycle

Beebo aims to minimize information collection. This document describes the repository implementation; operators must publish notices for their own deployment and assess applicable requirements.

| Data                                       | Location and purpose                                                | Retention / removal                                                           |
| ------------------------------------------ | ------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Board content and history                  | Participant browser memory; encrypted transmission to invited peers | Until tabs/processes close; invited users may export/retain copies            |
| Personal-board snapshot                    | This browser's IndexedDB, only after opt-in                         | Until the user selects Forget saved board or clears browser storage           |
| JSON / PNG exports                         | User-selected downloads, plaintext                                  | Controlled by the recipient/device owner                                      |
| Invitation secret                          | Browser URL fragment and memory; shared out of band by the user     | May remain in browser history, clipboard, messages, or recipients' copies     |
| Admission verifier                         | Signaling process memory                                            | Room expires or server restarts                                               |
| Admission token                            | WebSocket admission and server memory while handled                 | Not logged or persisted by application code                                   |
| Room membership, peer identifiers, SDP/ICE | Signaling memory and network exchange for connectivity              | Session/room lifecycle; application request logging is disabled               |
| Display name and cursor                    | Peer browsers, encrypted presence messages                          | Presence expires shortly after inactivity/disconnection; not in board exports |
| IP addresses and traffic metadata          | Necessarily visible to hosting/signaling/TURN/network operators     | Operator-controlled infrastructure logs; not controlled by the application    |

No analytics, advertising identifiers, third-party fonts, remote asset requests, mandatory email address, camera, microphone, or geolocation are used. Low-bandwidth settings and display names are not persisted. The app starts without restoring stored personal content; restoration is explicit.

The header's Save board locally checkbox enables automatic saving for personal boards and remains disabled in shared rooms. Save board writes an explicit local snapshot, including a shared board only when the user deliberately clicks it. Export board downloads a portable plaintext file. These actions do not upload the board to a server.

## Connection policy

Default relay-only WebRTC prevents other participants from learning endpoint IP addresses through direct peer connectivity. It does not hide endpoint IP addresses from the relay or application infrastructure. Direct connections are an explicit option and can reveal endpoint addresses to participants. The room creator selects the policy; invitees are told this before joining.

## Limits of protection

Every invitation holder is an editor and can copy the board. There is no per-user deletion request mechanism that erases someone else's saved copy, participant revocation, classroom role enforcement, or group key rotation. Host compromise can expose secrets through modified application code. Extensions and compromised devices can read content. Local storage and downloads are not encrypted at rest.

For a sensitive session, minimize personal information, share invitations privately, export only when appropriate, and clear saved personal content on shared devices. Closing tabs does not clear exported files, browser history, clipboard contents, or separately enabled personal storage.

## Operator responsibilities

Assess the intended jurisdictions, learner ages, institutional roles, consent or other applicable processing grounds, rights requests, and accessibility obligations. Provide an accurate deployment privacy notice, contact, infrastructure log/retention policy, and incident process. Do not imply universal legal compliance from this design.

Public deployment for minors requires a separate assessment. No legal compliance certification or child-safety certification has been obtained.
