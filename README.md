# Adidas Bruteforcer

Launches instances of puppeteer browsers to a specified url and notifies you when an adidas cart page is detected.

### Installing
Clone or download the repository

```
git clone https://github.com/Joxroxagain/adidas-bruteforcer.git
```
Navigate to the folder to which you downloaded the files.

Create a file called ```cookies.json``` and either
1) Enter '{}' to skip google login
2) Or use the chrome extension EditThisCookie to export your google cookies as JSON and enter the output into this file

Edit the config file as you wish.

Then run the following commands to start:
```
npm install
npm start
```
### TODO
- [x] Notify on cart page
- [x] Google sign in to prevent captchas
- [ ] Auto ATC
- [ ] Captcha harvesting?
- [ ] Headless mode
- [ ] Scheduled release refresh
- [ ] Save cookies on cart for use in requests
- [ ] Stock monitor

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details
