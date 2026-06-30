CREATE TABLE `impiantidocumentiCiesse` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `idimpianto` int(11) NOT NULL,
  `nome` varchar(255) NOT NULL,
  `documento` varchar(255) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=15 DEFAULT CHARSET=latin1;